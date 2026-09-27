import asyncio
import base64
import json
import logging
from typing import AsyncGenerator, Optional
import httpx
from app.config import settings
from app.llm.sentence_chunker import clean_spoken_text
from app.tts.base import BaseTTS

logger = logging.getLogger(__name__)

class SarvamStreamingTTS(BaseTTS):
    def __init__(self):
        self.client: Optional[httpx.AsyncClient] = None
        self.is_connected = False

    async def connect(self):
        if not settings.SARVAM_API_KEY:
            logger.warning("SARVAM_API_KEY not set. SarvamStreamingTTS in offline mode.")
            return

        # Initialize persistent connection pool with HTTP keep-alive
        self.client = httpx.AsyncClient(
            timeout=15.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=30.0)
        )
        self.is_connected = True
        logger.info("Sarvam Bulbul TTS initialized with persistent keep-alive connection pool.")

    async def synthesize_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        text = clean_spoken_text(text).strip()
        if not text:
            return

        if not settings.SARVAM_API_KEY:
            logger.warning("No SARVAM_API_KEY available for TTS synthesis.")
            return

        if not self.client or self.client.is_closed:
            self.client = httpx.AsyncClient(
                timeout=15.0,
                limits=httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=30.0)
            )
            self.is_connected = True

        # Auto-detect language: if Devanagari Hindi characters are present, use hi-IN
        is_devanagari = any('\u0900' <= char <= '\u097f' for char in text)
        target_lang = "hi-IN" if is_devanagari else settings.TTS_LANGUAGE_CODE

        url = "https://api.sarvam.ai/text-to-speech"
        headers = {
            "api-subscription-key": settings.SARVAM_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "inputs": [text],
            "target_language_code": target_lang,
            "speaker": settings.SARVAM_TTS_SPEAKER,
            "pitch": 0,
            "pace": 1.05,
            "loudness": 1.5,
            "speech_sample_rate": settings.TTS_SAMPLE_RATE,
            "enable_preprocessing": True,
            "model": "bulbul:v3"
        }

        try:
            response = await self.client.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                audios = data.get("audios", [])
                for audio_b64 in audios:
                    if audio_b64:
                        yield base64.b64decode(audio_b64)
            else:
                logger.error(f"Sarvam TTS error {response.status_code}: {response.text}")
        except Exception as e:
            logger.error(f"Exception during Sarvam TTS synthesis: {e}")

    async def close(self):
        self.is_connected = False
        if self.client and not self.client.is_closed:
            try:
                await self.client.aclose()
            except Exception:
                pass
            self.client = None
