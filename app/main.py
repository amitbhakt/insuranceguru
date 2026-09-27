import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Optional
import httpx
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.llm.agent import ConversationalAgent
from app.pdf_utils import extract_text_from_pdf
from app.prompts.agent_prompt import get_system_prompt, load_policy_document
from app.state_machine import AgentState, TurnManager
from app.stt.sarvam_stt import SarvamStreamingSTT
from app.tts.sarvam_tts import SarvamStreamingTTS
from app.vad import VoiceActivityDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Arogya Shield Voice Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_GIST = [
    {
        "title": "Sum Insured & Plan Tiers",
        "badge": "3 Plans",
        "items": [
            "Silver: Rs. 5,00,000 (1% room rent cap / Rs. 5,000 per day)",
            "Gold: Rs. 10,00,000 (Single private A/C room, no rent cap)",
            "Platinum: Rs. 25,00,000 (Single private A/C room, no rent cap)",
        ],
    },
    {
        "title": "Inpatient & Day Care Coverage",
        "badge": "60 & 90 Days",
        "items": [
            "Pre-Hospitalisation: Up to 60 days prior to hospital admission",
            "Post-Hospitalisation: Up to 90 days immediately after discharge",
            "Day Care Surgeries: 100% covered requiring < 24 hrs stay",
            "Emergency Road Ambulance: Up to Rs. 3,000 per hospitalization",
            "AYUSH Inpatient: Covered up to 100% of sum insured in recognized hospitals",
        ],
    },
    {
        "title": "Waiting Periods",
        "badge": "Strict Rules",
        "items": [
            "Initial Illness Waiting Period: 30 days (accidental injury covered Day 1)",
            "Specific Ailments: 24 months for cataract, hernia, joint replacement",
            "Pre-Existing Diseases (PED): 36 months of continuous cover (diabetes, HTN)",
        ],
    },
    {
        "title": "Claims Procedure",
        "badge": "Cashless & Reimbursement",
        "items": [
            "Planned Cashless: Minimum 48 hours prior intimation to TPA desk",
            "Emergency Cashless: Within 24 hours of hospital admission",
            "Reimbursement Claims: Original bills must be submitted within 15 days of discharge",
            "Settlement TAT: 30 days from complete documentation submission",
        ],
    },
    {
        "title": "Key Exclusions & Limits",
        "badge": "Non-Covered",
        "items": [
            "Cosmetic or plastic surgery excluded unless required for burns/cancer",
            "Extreme & hazardous sports (skydiving, mountaineering, paragliding)",
            "Veterinary or pet medical expenses strictly excluded",
        ],
    },
]

# Global active policy document state
active_policy_document = {
    "filename": "Arogya Shield (Default)",
    "content": None,  # None = use default app/data/policy_document.md
    "gist": DEFAULT_GIST,
}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "sarvam_configured": bool(settings.SARVAM_API_KEY),
        "model": settings.SARVAM_LLM_MODEL,
        "active_policy": active_policy_document["filename"]
    }

@app.post("/api/policy/upload")
async def upload_policy(file: UploadFile = File(...)):
    """Uploads an insurance policy PDF or Markdown document to ground the agent."""
    try:
        contents = await file.read()
        if file.filename.lower().endswith(".pdf"):
            text = extract_text_from_pdf(contents)
        else:
            text = contents.decode("utf-8", errors="ignore")

        if not text.strip():
            return {"status": "error", "message": "Uploaded file is empty or could not be read."}

        active_policy_document["filename"] = file.filename
        active_policy_document["content"] = text

        # Dynamically extract structured highlight gist from the uploaded document using LLM
        gist = DEFAULT_GIST
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                prompt = (
                    "Analyze this insurance policy text and extract 4 structured highlight sections "
                    "as a JSON array of objects with keys \"title\", \"badge\", and \"items\" (list of 2-4 concise strings). "
                    "Output ONLY valid JSON, nothing else.\n\nText:\n" + text[:4500]
                )
                res = await client.post(
                    settings.SARVAM_LLM_URL,
                    json={
                        "model": settings.SARVAM_LLM_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "max_tokens": 500
                    },
                    headers={"api-subscription-key": settings.SARVAM_API_KEY, "Content-Type": "application/json"}
                )
                if res.status_code == 200:
                    raw_content = res.json()["choices"][0]["message"]["content"].strip()
                    if raw_content.startswith("```"):
                        raw_content = raw_content.split("```")[1]
                        if raw_content.startswith("json"):
                            raw_content = raw_content[4:]
                    parsed = json.loads(raw_content.strip())
                    if isinstance(parsed, list) and len(parsed) > 0:
                        gist = parsed
        except Exception as ex:
            logger.warning(f"Could not extract dynamic gist via LLM: {ex}")

        active_policy_document["gist"] = gist
        logger.info(f"Custom policy uploaded successfully: {file.filename} ({len(text)} chars)")

        return {
            "status": "success",
            "filename": file.filename,
            "char_count": len(text),
            "gist": gist,
            "preview": text[:400]
        }
    except Exception as e:
        logger.error(f"Error processing policy upload: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/policy/current")
async def get_current_policy():
    """Returns the currently active policy document and metadata."""
    content = active_policy_document["content"] or load_policy_document()
    return {
        "filename": active_policy_document["filename"],
        "is_custom": active_policy_document["content"] is not None,
        "char_count": len(content),
        "content": content,
        "gist": active_policy_document.get("gist", DEFAULT_GIST),
    }

@app.post("/api/policy/reset")
async def reset_policy():
    """Resets the active policy to the default Arogya Shield policy document."""
    active_policy_document["filename"] = "Arogya Shield (Default)"
    active_policy_document["content"] = None
    active_policy_document["gist"] = DEFAULT_GIST
    return {"status": "reset", "filename": active_policy_document["filename"]}

@app.post("/api/policy/sample")
async def load_sample_policy():
    """Loads the sample Star Comprehensive Health Plan PDF as an active custom document."""
    sample_path = Path(__file__).resolve().parent / "data" / "Star_Comprehensive_Health_Plan.pdf"
    if not sample_path.exists():
        return {"status": "error", "message": "Sample PDF not found."}

    contents = sample_path.read_bytes()
    text = extract_text_from_pdf(contents)
    active_policy_document["filename"] = "Star_Comprehensive_Health_Plan.pdf"
    active_policy_document["content"] = text

    # Extract gist via LLM
    gist = DEFAULT_GIST
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            prompt = (
                "Analyze this insurance policy text and extract 4 structured highlight sections "
                "as a JSON array of objects with keys \"title\", \"badge\", and \"items\" (list of 2-4 concise strings). "
                "Output ONLY valid JSON, nothing else.\n\nText:\n" + text[:4500]
            )
            res = await client.post(
                settings.SARVAM_LLM_URL,
                json={
                    "model": settings.SARVAM_LLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 500
                },
                headers={"api-subscription-key": settings.SARVAM_API_KEY, "Content-Type": "application/json"}
            )
            if res.status_code == 200:
                raw_content = res.json()["choices"][0]["message"]["content"].strip()
                if raw_content.startswith("```"):
                    raw_content = raw_content.split("```")[1]
                    if raw_content.startswith("json"):
                        raw_content = raw_content[4:]
                parsed = json.loads(raw_content.strip())
                if isinstance(parsed, list) and len(parsed) > 0:
                    gist = parsed
    except Exception as ex:
        logger.warning(f"Could not extract dynamic gist via LLM: {ex}")

    active_policy_document["gist"] = gist
    return {
        "status": "success",
        "filename": "Star_Comprehensive_Health_Plan.pdf",
        "char_count": len(text),
        "gist": gist
    }

@app.websocket("/ws/audio")
async def websocket_audio_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /ws/audio")

    current_transcript = ""

    # Callbacks for STT partials and finals
    async def on_stt_partial(text: str):
        nonlocal current_transcript
        clean_text = text.strip()
        if turn_manager.state == AgentState.LISTENING and clean_text:
            current_transcript = clean_text
        await send_json({
            "type": "partial_transcript",
            "text": text
        })

    async def on_stt_final(text: str):
        nonlocal current_transcript
        clean_text = text.strip()
        if not clean_text:
            return

        logger.info(f"STT final received: '{clean_text}' (state: {turn_manager.state})")
        current_transcript = clean_text

        await send_json({
            "type": "final_transcript",
            "text": clean_text
        })

        if turn_manager.state == AgentState.LISTENING:
            if len(clean_text) > 1 and clean_text.lower() not in ["i", "a", "the", "uh", "um", "ah", "oh"]:
                t_speech_stopped = vad.last_speech_time or time.time()
                vad_hangover = vad.silence_hangover_ms
                stt_latency_ms = max(int((time.time() - t_speech_stopped) * 1000) - vad_hangover, 50)
                current_transcript = ""
                vad.reset()
                _sync_agent_policy()
                await turn_manager.handle_speech_endpoint(
                    clean_text,
                    vad_duration_ms=vad_hangover,
                    stt_duration_ms=stt_latency_ms,
                )

    stt = SarvamStreamingSTT(on_partial=on_stt_partial, on_final=on_stt_final)
    tts = SarvamStreamingTTS()
    vad = VoiceActivityDetector()

    # Ground conversational agent on active policy document
    active_policy_text = active_policy_document["content"]
    system_prompt = get_system_prompt(active_policy_text)
    agent = ConversationalAgent(system_prompt=system_prompt)

    async def send_json(data: dict):
        try:
            await websocket.send_text(json.dumps(data))
        except Exception:
            pass

    async def send_audio(chunk: bytes):
        try:
            await websocket.send_bytes(chunk)
        except Exception:
            pass

    async def on_call_ended():
        try:
            await websocket.close(code=1000)
        except Exception:
            pass

    turn_manager = TurnManager(
        send_json=send_json,
        send_audio=send_audio,
        agent=agent,
        tts=tts,
        on_call_ended=on_call_ended
    )

    # Initialize STT and TTS connections
    await stt.connect()
    await tts.connect()
    await turn_manager.set_state(AgentState.LISTENING)

    last_activity_time = time.time()

    async def inactivity_monitor():
        try:
            while True:
                await asyncio.sleep(5)
                # Auto-disconnect if completely inactive for 90 seconds in LISTENING state
                if turn_manager.state == AgentState.LISTENING:
                    if time.time() - last_activity_time > 90.0:
                        logger.info("Call ended due to 90s inactivity.")
                        await send_json({
                            "type": "call_ended",
                            "reason": "inactivity",
                            "message": "Call ended due to inactivity."
                        })
                        await on_call_ended()
                        break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Inactivity monitor error: {e}")

    inactivity_task = asyncio.create_task(inactivity_monitor())

    def _sync_agent_policy():
        """Ensure agent is always grounded on the latest active policy document."""
        active_text = active_policy_document["content"]
        expected = get_system_prompt(active_text)
        if agent.system_prompt != expected:
            agent.system_prompt = expected
            if agent.messages and agent.messages[0]["role"] == "system":
                agent.messages[0]["content"] = expected
            else:
                agent.messages.insert(0, {"role": "system", "content": expected})

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                pcm_bytes = message["bytes"]
                agent_speaking = (turn_manager.state == AgentState.SPEAKING)
                is_voiced, is_endpoint, is_barge_in = vad.process_frame(
                    pcm_bytes, agent_is_speaking=agent_speaking
                )

                if is_voiced or is_barge_in:
                    last_activity_time = time.time()

                # Send frame to STT for streaming transcription
                await stt.send_audio(pcm_bytes)

                if is_barge_in:
                    logger.info("Barge-in detected by VAD.")
                    current_transcript = ""
                    await turn_manager.handle_barge_in()
                    vad.reset()

                if is_endpoint and turn_manager.state == AgentState.LISTENING:
                    transcript = current_transcript.strip()
                    if len(transcript) > 1 and transcript.lower() not in ["i", "a", "the", "uh", "um", "ah", "oh"]:
                        transcript_to_send = transcript
                        current_transcript = ""
                        t_speech_stopped = vad.last_speech_time or time.time()
                        vad_hangover = vad.silence_hangover_ms
                        stt_latency_ms = max(int((time.time() - t_speech_stopped) * 1000) - vad_hangover, 50)
                        vad.reset()
                        _sync_agent_policy()
                        await turn_manager.handle_speech_endpoint(
                            transcript_to_send,
                            vad_duration_ms=vad_hangover,
                            stt_duration_ms=stt_latency_ms,
                        )
                    else:
                        # User stopped speaking, but Sarvam STT cloud transcript may still be arriving over network.
                        # Do not wipe current_transcript; let on_stt_final handle it when the final frame arrives.
                        vad.reset()

            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")
                    last_activity_time = time.time()

                    if msg_type == "playback_ended":
                        turn_manager.notify_playback_ended()

                    elif msg_type == "start_session":
                        # Check if a custom policy text was passed in message
                        custom_policy_override = payload.get("custom_policy")
                        if custom_policy_override:
                            active_policy_document["content"] = custom_policy_override
                            agent.system_prompt = get_system_prompt(custom_policy_override)
                            agent.messages = [{"role": "system", "content": agent.system_prompt}]

                        _sync_agent_policy()

                        initial_query = payload.get("initial_query", "").strip()
                        if initial_query:
                            await send_json({
                                "type": "status_update",
                                "status": "ready",
                                "message": "AI is ready."
                            })
                            await turn_manager.handle_speech_endpoint(
                                initial_query,
                                vad_duration_ms=0,
                                stt_duration_ms=0,
                            )
                        else:
                            # Default greeting (no LLM generation)
                            greeting = "Hello! Welcome to Arogya Shield. How may I help you?"

                            # Conversation history contains system prompt and the opening greeting
                            agent.messages = [
                                {"role": "system", "content": agent.system_prompt},
                                {"role": "assistant", "content": greeting}
                            ]

                            await send_json({
                                "type": "status_update",
                                "status": "ready",
                                "message": "AI is ready."
                            })

                            # Stream greeting directly via TTS as an active cancellable task for barge-in support
                            await turn_manager.play_greeting(greeting)

                    elif msg_type == "text_input":
                        query = payload.get("text", "").strip()
                        if query:
                            _sync_agent_policy()
                            await turn_manager.handle_speech_endpoint(
                                query,
                                vad_duration_ms=0,
                                stt_duration_ms=0,
                            )

                    elif msg_type == "update_config":
                        if "silence_hangover_ms" in payload:
                            vad.silence_hangover_ms = int(payload["silence_hangover_ms"])
                        if "barge_in_ms" in payload:
                            vad.barge_in_min_duration_ms = int(payload["barge_in_ms"])

                except json.JSONDecodeError:
                    pass

    except (WebSocketDisconnect, RuntimeError):
        logger.info("Client disconnected from /ws/audio")
    except Exception as e:
        logger.error(f"WebSocket session error: {e}", exc_info=True)
    finally:
        if inactivity_task and not inactivity_task.done():
            inactivity_task.cancel()
        if turn_manager.active_turn_task and not turn_manager.active_turn_task.done():
            turn_manager.active_turn_task.cancel()
        await stt.close()
        await tts.close()

# Mount frontend if built
dist_path = Path(__file__).resolve().parent.parent / ".output" / "public"
if not dist_path.exists():
    dist_path = Path(__file__).resolve().parent.parent / "dist"

if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")
