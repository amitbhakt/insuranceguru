import asyncio
import logging
import re
import time
from enum import Enum
from typing import Callable, Coroutine, Optional
from app.llm.agent import ConversationalAgent
from app.llm.sentence_chunker import SentenceChunker
from app.tts.sarvam_tts import SarvamStreamingTTS

logger = logging.getLogger(__name__)

class AgentState(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"

# Conversational farewell patterns
FAREWELL_USER_PATTERNS = [
    re.compile(r"\b(bye|goodbye|good\s*bye|tata|see\s*you)\b", re.IGNORECASE),
    re.compile(r"\b(thank\s*you|thanks)\b.*\b(that('?s|\s+is)\s*all|nothing\s*else|bye|done)\b", re.IGNORECASE),
    re.compile(r"\b(that('?s|\s+is)\s*all|nothing\s*else|no\s*more\s*questions|no\s*other\s*questions)\b", re.IGNORECASE),
    re.compile(r"\b(call\s*(disconnect|cut|end|close|khatam|band)|disconnect\s*call|end\s*call)\b", re.IGNORECASE),
    re.compile(r"\b(bas\s*(itna\s*hi|aur\s*kuch\s*nahi|thank\s*you|shukriya|dhanyawad))\b", re.IGNORECASE),
    re.compile(r"\b(aur\s*kuch\s*nahi|kuch\s*nahi\s*puchna|ho\s*gaya\s*bas)\b", re.IGNORECASE),
]

FAREWELL_AGENT_PATTERNS = [
    re.compile(r"\btake\s*care\b", re.IGNORECASE),
    re.compile(r"\b(अलविदा|बाय|goodbye)\b", re.IGNORECASE),
    re.compile(r"(कभी\s*भी\s*policy\s*से\s*related|kabhi\s*bhi\s*policy\s*se\s*related)", re.IGNORECASE),
    re.compile(r"happy\s*to\s*help.*whenever\s*you\s*have\s*more\s*questions", re.IGNORECASE),
    re.compile(r"\b(call\s*disconnect|call\s*end)\b", re.IGNORECASE),
]

class TurnManager:
    """
    Manages turn-taking lifecycle, concurrency cancellation on barge-in,
    and stage-by-stage latency tracking.
    """
    def __init__(
        self,
        send_json: Callable[[dict], Coroutine],
        send_audio: Callable[[bytes], Coroutine],
        agent: ConversationalAgent,
        tts: SarvamStreamingTTS,
        on_call_ended: Optional[Callable[[], Coroutine]] = None
    ):
        self.send_json = send_json
        self.send_audio = send_audio
        self.agent = agent
        self.tts = tts
        self.on_call_ended = on_call_ended

        self.state = AgentState.IDLE
        self.active_turn_task: Optional[asyncio.Task] = None
        self.playback_finished_event = asyncio.Event()
        self.t_speech_end: float = 0.0

    async def set_state(self, new_state: AgentState):
        self.state = new_state
        await self.send_json({"type": "state_change", "state": new_state.value})

    def notify_playback_ended(self):
        """Called when browser signals that all queued audio chunks have finished playing."""
        self.playback_finished_event.set()

    def _is_farewell(self, user_text: str, agent_text: str) -> bool:
        """Determines if the conversation has reached a natural farewell conclusion."""
        for pattern in FAREWELL_USER_PATTERNS:
            if pattern.search(user_text):
                return True
        for pattern in FAREWELL_AGENT_PATTERNS:
            if pattern.search(agent_text):
                return True
        return False

    async def handle_speech_endpoint(
        self,
        user_transcript: str,
        vad_duration_ms: int = 650,
        stt_duration_ms: int = 0
    ):
        """Called when VAD detects end of user speech or user sends text input."""
        if not user_transcript.strip():
            await self.set_state(AgentState.LISTENING)
            return

        self.t_speech_end = time.time()
        await self.send_json({"type": "final_transcript", "text": user_transcript})
        await self.set_state(AgentState.THINKING)

        # Cancel any previous in-flight turn task
        if self.active_turn_task and not self.active_turn_task.done():
            self.active_turn_task.cancel()

        self.active_turn_task = asyncio.create_task(
            self._process_turn(user_transcript, vad_duration_ms, stt_duration_ms)
        )

    async def handle_barge_in(self):
        """Called when sustained user speech triggers barge-in during SPEAKING or THINKING."""
        logger.info(f"Barge-in triggered during state {self.state}")
        if self.state in [AgentState.SPEAKING, AgentState.THINKING]:
            if self.active_turn_task and not self.active_turn_task.done():
                self.active_turn_task.cancel()
                self.active_turn_task = None

            self.playback_finished_event.set()
            await self.set_state(AgentState.INTERRUPTED)
            await self.send_json({"type": "interrupt"})
            # Return quickly to listening so interrupting speech continues to be captured
            await self.set_state(AgentState.LISTENING)

    async def play_greeting(self, text: str):
        """Streams greeting directly via TTS as an active cancellable task for barge-in support."""
        if self.active_turn_task and not self.active_turn_task.done():
            self.active_turn_task.cancel()

        self.active_turn_task = asyncio.create_task(self._process_greeting(text))

    async def _process_greeting(self, text: str):
        try:
            self.playback_finished_event.clear()
            await self.set_state(AgentState.SPEAKING)
            await self.send_json({"type": "agent_chunk", "text": text, "is_final": True})
            async for chunk in self.tts.synthesize_stream(text):
                await self.send_audio(chunk)

            # Maintain SPEAKING state during audio playback so VAD barge-in is active
            est_duration = max(len(text.split()) * 0.38, 2.5)
            try:
                await asyncio.wait_for(
                    self.playback_finished_event.wait(),
                    timeout=est_duration + 1.2
                )
            except asyncio.TimeoutError:
                pass

            await self.set_state(AgentState.LISTENING)
        except asyncio.CancelledError:
            logger.info("Greeting playback cancelled via barge-in.")
        except Exception as e:
            logger.error(f"Error streaming greeting: {e}")
            err_str = str(e)
            is_quota = "credits" in err_str.lower() or "402" in err_str
            is_auth = "403" in err_str or "401" in err_str
            code = "CREDITS_EXHAUSTED" if is_quota else ("INVALID_API_KEY" if is_auth else "TTS_ERROR")
            await self.send_json({
                "type": "error",
                "message": err_str if (is_quota or is_auth) else f"Greeting playback failed: {err_str}",
                "error_code": code
            })
            await self.set_state(AgentState.LISTENING)

    async def _process_turn(self, user_transcript: str, vad_duration_ms: int, stt_duration_ms: int = 0):
        producer_task: Optional[asyncio.Task] = None
        t_turn_start = time.time()
        try:
            self.playback_finished_event.clear()
            chunker = SentenceChunker()
            sentence_queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

            async def llm_producer():
                try:
                    async for token in self.agent.stream_response(user_transcript):
                        for sentence in chunker.feed(token):
                            await sentence_queue.put(sentence)
                    for sentence in chunker.flush():
                        await sentence_queue.put(sentence)
                except Exception as e:
                    logger.error(f"Error in LLM producer: {e}")
                finally:
                    await sentence_queue.put(None)

            producer_task = asyncio.create_task(llm_producer())

            first_sentence_sent = False
            t_llm_first = 0.0
            t_tts_first = 0.0
            total_words = 0
            agent_sentences = []

            while True:
                sentence = await sentence_queue.get()
                if sentence is None:
                    break

                if not sentence.strip():
                    continue

                total_words += len(sentence.split())
                agent_sentences.append(sentence)

                if not first_sentence_sent:
                    first_sentence_sent = True
                    t_llm_first = time.time()
                    await self.set_state(AgentState.SPEAKING)

                first_audio_time = None
                def on_first_audio():
                    nonlocal first_audio_time
                    if first_audio_time is None:
                        first_audio_time = time.time()

                await self._synthesize_and_stream_sentence(
                    sentence, is_first=(t_tts_first == 0.0), on_first_chunk=on_first_audio
                )

                if t_tts_first == 0.0:
                    t_tts_first = first_audio_time or time.time()
                    llm_ms = max(int((t_llm_first - t_turn_start) * 1000), 50)
                    tts_ms = max(int((t_tts_first - t_llm_first) * 1000), 50)
                    # TTFA represents the true pipeline response latency:
                    # from turn start / speech end to the very first audible chunk
                    ttfa = stt_duration_ms + llm_ms + tts_ms
                    await self.send_json({
                        "type": "latency_metrics",
                        "ttfa": ttfa,
                        "vadMs": vad_duration_ms,
                        "sttMs": stt_duration_ms,
                        "llmMs": llm_ms,
                        "ttsMs": tts_ms
                    })

            agent_full_text = " ".join(agent_sentences)
            is_farewell_turn = self._is_farewell(user_transcript, agent_full_text)

            # Maintain SPEAKING state while the browser plays out all audio buffers
            # so that user speech during playback reliably triggers VAD barge-in
            est_duration = max(total_words * 0.38, 2.0)
            try:
                await asyncio.wait_for(
                    self.playback_finished_event.wait(),
                    timeout=est_duration + 1.2
                )
            except asyncio.TimeoutError:
                pass

            if is_farewell_turn:
                logger.info("Conversational farewell complete. Closing call.")
                await asyncio.sleep(0.8)
                await self.send_json({
                    "type": "call_ended",
                    "reason": "conversation_complete",
                    "message": "Call ended · Thank you for contacting Arogya Shield!"
                })
                if self.on_call_ended:
                    await self.on_call_ended()
                return

            await self.set_state(AgentState.LISTENING)

        except asyncio.CancelledError:
            logger.info("Active turn task cancelled via barge-in.")
        except Exception as e:
            logger.error(f"Error processing turn: {e}", exc_info=True)
            err_str = str(e)
            is_quota = "credits" in err_str.lower() or "402" in err_str
            is_auth = "403" in err_str or "401" in err_str
            code = "CREDITS_EXHAUSTED" if is_quota else ("INVALID_API_KEY" if is_auth else "TURN_ERROR")
            await self.send_json({
                "type": "error",
                "message": err_str if (is_quota or is_auth) else f"Failed to process turn: {err_str}",
                "error_code": code
            })
            await self.set_state(AgentState.LISTENING)
        finally:
            if producer_task and not producer_task.done():
                producer_task.cancel()

    async def _synthesize_and_stream_sentence(
        self,
        sentence: str,
        is_first: bool = False,
        on_first_chunk: Optional[Callable[[], None]] = None
    ):
        if not sentence.strip():
            return
        # Notify UI of the sentence text being spoken
        await self.send_json({"type": "agent_chunk", "text": sentence, "is_final": False})

        first_chunk_sent = False
        # Synthesize audio and send chunks to client
        async for audio_chunk in self.tts.synthesize_stream(sentence):
            if not first_chunk_sent and on_first_chunk:
                first_chunk_sent = True
                on_first_chunk()
            await self.send_audio(audio_chunk)
