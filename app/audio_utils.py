import struct
import io
import wave
import numpy as np

def calculate_rms(pcm_bytes: bytes) -> float:
    """Calculates Root-Mean-Square energy of 16-bit linear PCM audio."""
    if not pcm_bytes or len(pcm_bytes) < 2:
        return 0.0
    # 16-bit signed PCM mono
    count = len(pcm_bytes) // 2
    format_str = f"<{count}h"
    try:
        samples = struct.unpack(format_str, pcm_bytes[:count * 2])
        arr = np.array(samples, dtype=np.float32) / 32768.0
        rms = np.sqrt(np.mean(arr ** 2))
        return float(rms)
    except Exception:
        return 0.0

def pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> bytes:
    """Wraps raw 16-bit PCM bytes into a valid WAV container with headers."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buf.getvalue()
