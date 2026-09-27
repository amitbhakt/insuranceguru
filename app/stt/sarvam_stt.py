import asyncio
import json
import logging
from typing import Callable, Optional
import websockets
from app.config import settings
from app.stt.base import BaseSTT

logger = logging.getLogger(__name__)

class SarvamStreamingSTT(BaseSTT):
    def __init__(
        self,
        on_partial: Optional[Callable[[str], None]] = None,
        on_final: Optional[Callable[[str], None]] = None,
        api_key: Optional[str] = None,
    ):
        self.on_partial = on_partial
        self.on_final = on_final
        self.api_key = api_key or settings.SARVAM_API_KEY
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.listen_task: Optional[asyncio.Task] = None
        self.is_connected = False

    async def connect(self):
        if not self.api_key:
            logger.warning("No Sarvam API key provided. SarvamStreamingSTT running in degraded mode.")
            return

        headers = {
            "api-subscription-key": self.api_key
        }
        url = (
            f"{settings.SARVAM_STT_WS_URL}?"
            f"model={settings.SARVAM_STT_MODEL}&"
            f"language_code={settings.STT_LANGUAGE_CODE}&"
            f"silence_duration_ms={settings.VAD_SILENCE_HANGOVER_MS}"
        )
        
        try:
            self.ws = await websockets.connect(
                url,
                additional_headers=headers,
                ping_interval=10,
                ping_timeout=5
            )
            self.is_connected = True
            self.listen_task = asyncio.create_task(self._listen_loop())
            logger.info(f"Connected to Sarvam Saaras Realtime STT WebSocket ({url}).")
        except Exception as e:
            logger.error(f"Failed to connect to Sarvam STT: {e}")
            self.is_connected = False

    async def _listen_loop(self):
        try:
            while self.is_connected and self.ws:
                msg = await self.ws.recv()
                if isinstance(msg, str):
                    try:
                        data = json.loads(msg)
                        event = data.get("event", "")
                        
                        # Extract transcript text across various schemas
                        transcript = ""
                        if "text" in data and isinstance(data["text"], str):
                            transcript = data["text"]
                        elif "transcript" in data and isinstance(data["transcript"], str):
                            transcript = data["transcript"]
                        elif "data" in data and isinstance(data["data"], dict):
                            transcript = data["data"].get("transcript") or data["data"].get("text") or ""

                        is_final = (
                            event == "transcript.final" or
                            data.get("is_final") is True or
                            data.get("type") == "final"
                        )

                        if transcript:
                            if is_final and self.on_final:
                                if asyncio.iscoroutinefunction(self.on_final):
                                    await self.on_final(transcript)
                                else:
                                    res = self.on_final(transcript)
                                    if asyncio.iscoroutine(res):
                                        await res
                            elif self.on_partial:
                                if asyncio.iscoroutinefunction(self.on_partial):
                                    await self.on_partial(transcript)
                                else:
                                    res = self.on_partial(transcript)
                                    if asyncio.iscoroutine(res):
                                        await res
                    except json.JSONDecodeError:
                        pass
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in Sarvam STT listen loop: {e}")
        finally:
            self.is_connected = False

    async def send_audio(self, pcm_bytes: bytes):
        if self.is_connected and self.ws:
            try:
                # Send raw binary PCM audio frame
                await self.ws.send(pcm_bytes)
            except Exception as e:
                logger.error(f"Error sending audio to Sarvam STT: {e}")

    async def close(self):
        self.is_connected = False
        if self.listen_task and not self.listen_task.done():
            self.listen_task.cancel()
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None
