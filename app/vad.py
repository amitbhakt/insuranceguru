import time
from typing import Optional, Tuple
from app.audio_utils import calculate_rms
from app.config import settings

class VoiceActivityDetector:
    """
    Evaluates audio frames for speech activity, enforces silence hangover for endpointing,
    and discriminates short backchannels ('mm-hm') from sustained barge-in.
    """
    def __init__(
        self,
        energy_threshold: float = None,
        silence_hangover_ms: int = None,
        barge_in_min_duration_ms: int = None,
        sample_rate: int = 16000
    ):
        self.energy_threshold = energy_threshold or settings.VAD_ENERGY_THRESHOLD
        self.silence_hangover_ms = silence_hangover_ms or settings.VAD_SILENCE_HANGOVER_MS
        self.barge_in_min_duration_ms = barge_in_min_duration_ms or settings.VAD_BARGE_IN_MIN_DURATION_MS
        self.sample_rate = sample_rate

        self.is_speech_active = False
        self.speech_start_time: Optional[float] = None
        self.last_speech_time: Optional[float] = None
        self.consecutive_speech_ms = 0
        self.consecutive_silence_ms = 0

    def reset(self):
        self.is_speech_active = False
        self.speech_start_time = None
        self.last_speech_time = None
        self.consecutive_speech_ms = 0
        self.consecutive_silence_ms = 0

    def process_frame(
        self,
        pcm_bytes: bytes,
        agent_is_speaking: bool = False
    ) -> Tuple[bool, bool, bool]:
        """
        Processes a raw PCM frame (typically 20-30ms).
        Returns:
            (is_voiced, is_endpoint, is_barge_in)
        """
        # Duration of this frame in ms (16-bit mono = 2 bytes per sample)
        num_samples = len(pcm_bytes) // 2
        frame_duration_ms = int((num_samples / self.sample_rate) * 1000)
        if frame_duration_ms <= 0:
            return False, False, False

        rms = calculate_rms(pcm_bytes)
        # Dynamically raise threshold during agent playback to reject acoustic echo / laptop speaker bleed
        # while keeping sensitivity high enough for natural user barge-in
        effective_threshold = max(self.energy_threshold * 1.6, 0.022) if agent_is_speaking else self.energy_threshold
        is_voiced = rms >= effective_threshold
        now = time.time()

        is_endpoint = False
        is_barge_in = False

        if is_voiced:
            self.consecutive_speech_ms += frame_duration_ms
            self.consecutive_silence_ms = 0
            self.last_speech_time = now

            if not self.is_speech_active:
                self.is_speech_active = True
                self.speech_start_time = now

            # If agent is speaking, check if continuous speech exceeds barge-in threshold
            if agent_is_speaking:
                if self.consecutive_speech_ms >= self.barge_in_min_duration_ms:
                    is_barge_in = True
        else:
            self.consecutive_silence_ms += frame_duration_ms
            # If silence is brief, keep consecutive speech; if silence persists > 150ms, reset continuous speech
            if self.consecutive_silence_ms > 150:
                self.consecutive_speech_ms = 0

            # Check for endpointing if speech was active
            if self.is_speech_active and self.consecutive_silence_ms >= self.silence_hangover_ms:
                is_endpoint = True
                self.is_speech_active = False
                self.speech_start_time = None

        return is_voiced, is_endpoint, is_barge_in
