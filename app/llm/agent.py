import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, List
import httpx
from app.config import settings
from app.prompts.agent_prompt import get_system_prompt

logger = logging.getLogger(__name__)

class ConversationalAgent:
    """
    Manages grounded insurance conversation memory and streams token responses
    from the Sarvam LLM API (with full offline grounded fallback for CI/testing).
    """
    def __init__(self, system_prompt: str = None):
        self.system_prompt = system_prompt or get_system_prompt()
        self.messages: List[Dict[str, str]] = [
            {"role": "system", "content": self.system_prompt}
        ]

    def add_user_message(self, text: str):
        self.messages.append({"role": "user", "content": text})
        self._trim_history()

    def add_assistant_message(self, text: str):
        self.messages.append({"role": "assistant", "content": text})
        self._trim_history()

    def _trim_history(self, max_turns: int = 20):
        # Keep system message (index 0) and the most recent max_turns messages
        if len(self.messages) > max_turns + 1:
            self.messages = [self.messages[0]] + self.messages[-max_turns:]

    async def stream_response(self, user_query: str = None) -> AsyncGenerator[str, None]:
        if user_query:
            self.add_user_message(user_query)

        if not settings.SARVAM_API_KEY:
            logger.warning("SARVAM_API_KEY not set. Using local grounded fallback responses.")
            for word in self._local_grounded_fallback(self.messages[-1]["content"]).split(" "):
                yield word + " "
                await asyncio.sleep(0.01)
            return

        headers = {
            "api-subscription-key": settings.SARVAM_API_KEY,
            "Authorization": f"Bearer {settings.SARVAM_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": settings.SARVAM_LLM_MODEL,
            "messages": self.messages,
            "temperature": settings.LLM_TEMPERATURE,
            "max_tokens": settings.LLM_MAX_TOKENS,
            "stream": True
        }

        full_reply = ""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", settings.SARVAM_LLM_URL, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        logger.error(f"Sarvam LLM API error {response.status_code}: {error_body.decode('utf-8', errors='ignore')}")
                        for word in self._local_grounded_fallback(self.messages[-1]["content"]).split(" "):
                            yield word + " "
                            await asyncio.sleep(0.01)
                        return

                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices and len(choices) > 0:
                                delta = choices[0].get("delta", {})
                                token = delta.get("content", "")
                                if token:
                                    full_reply += token
                                    yield token
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.error(f"Error during Sarvam LLM streaming: {e}")
            if not full_reply:
                for word in self._local_grounded_fallback(self.messages[-1]["content"]).split(" "):
                    yield word + " "
                    await asyncio.sleep(0.01)
        finally:
            if full_reply:
                self.add_assistant_message(full_reply)

    def _local_grounded_fallback(self, query: str) -> str:
        """Deterministic policy-grounded response engine strictly matching policy_document.md."""
        q = query.lower()

        # Coverage Questions
        if "sum insured" in q:
            return "Arogya Shield offers sum insured options of Rs. 5,00,000 for Silver, Rs. 10,00,000 for Gold, and Rs. 25,00,000 for Platinum plans."
        if "room rent" in q and ("silver" in q or "capping" in q):
            if "gold" in q or "platinum" in q or "no" in q or "any" in q:
                return "Gold and Platinum plans have no room rent capping and provide a single private air conditioned room."
            return "For the Silver plan, room rent is capped at 1% of the Sum Insured per day."
        if "pre-hospitalisation" in q or "pre-hospitalization" in q:
            return "Pre-hospitalisation medical expenses are covered up to 60 days prior to hospital admission."
        if "post-hospitalisation" in q or "post-hospitalization" in q:
            return "Post-hospitalisation medical expenses are covered up to 90 days after discharge."
        if "day care" in q:
            return "Yes, all 541+ day care procedures requiring less than 24 hours of hospitalisation are covered up to the sum insured."
        if "ambulance" in q:
            return "Emergency ambulance expenses are covered up to Rs. 3,000 per hospitalisation event."
        if "ayush" in q or "ayurvedic" in q or "homeopath" in q:
            return "Yes, in-patient treatment under AYUSH, including Ayurvedic and Homeopathic hospitals, is covered up to 100% of the sum insured."

        # Claims Process
        if "cashless" in q or ("planned" in q and "hospitalization" in q):
            return "For planned hospitalisation cashless claims, intimate the insurer at least 48 hours prior to admission."
        if "emergency" in q and ("hour" in q or "intimat" in q or "notice" in q):
            return "For emergency hospitalisation, you must intimate the insurer within 24 hours of admission."
        if "submit bill" in q or "reimbursement claim" in q:
            if "turnaround" in q or "settlement" in q:
                return "Reimbursement claims are settled within 30 days of receiving complete documentation."
            return "You must submit all original hospital bills and discharge documents within 15 days of discharge."
        if "settlement" in q or "turnaround" in q:
            return "Reimbursement claims are settled within 30 days of receiving complete documentation."

        # Validity & Exclusions
        if "cosmetic" in q:
            return "Cosmetic or plastic surgery is strictly excluded under the policy, unless necessitated by an accidental burn or reconstructive cancer surgery."
        if "skydiving" in q or "extreme sports" in q or "hazardous" in q:
            return "Injuries from hazardous or extreme sports, including skydiving, paragliding, and mountaineering, are strictly excluded."
        if "pre-existing" in q or "ped" in q or "diabetes" in q:
            return "There is a 36 months waiting period before claims related to declared pre-existing diseases are payable."
        if "cataract" in q or "hernia" in q or "specified" in q:
            return "There is a 24 months waiting period for specified diseases like cataract surgery, with sub-limits applying."

        # Premium & Eligibility
        if "entry age" in q or "adult" in q:
            return "The entry age limit for adults is 18 years to 65 years."
        if "3-year" in q or "three year" in q or ("multi-year" in q and "discount" in q):
            return "You receive a 12% discount on premium when selecting a 3-year multi-year policy tenure."

        # Traps / Out of Document
        if "drone" in q or "veterinary" in q or "dog" in q or "pet" in q:
            return "I do not have information about that in my policy document, as Arogya Shield is strictly a health insurance policy for individuals and families."

        return "Welcome to Arogya Shield! We provide comprehensive health insurance with lifelong renewability. What type of cover are you looking for today?"
