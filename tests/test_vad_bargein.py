import numpy as np
import pytest
from app.vad import VoiceActivityDetector

def generate_pcm_frame(is_speech: bool, duration_ms: int = 30, sample_rate: int = 16000) -> bytes:
    """Generates synthetic 16-bit linear PCM audio frame."""
    num_samples = int((sample_rate * duration_ms) / 1000)
    if is_speech:
        # Loud speech tone (sine wave)
        t = np.linspace(0, duration_ms / 1000.0, num_samples, endpoint=False)
        waveform = 0.5 * np.sin(2 * np.pi * 440 * t)  # Amplitude 0.5 (well above 0.015 threshold)
    else:
        # Near silence
        waveform = np.random.normal(0, 0.001, num_samples)

    int16_samples = (waveform * 32767).astype(np.int16)
    return int16_samples.tobytes()

def test_vad_backchannel_ignored_during_speaking():
    """Short utterances (<300ms, e.g. 'mm-hm') must NOT trigger barge-in."""
    vad = VoiceActivityDetector(silence_hangover_ms=650, barge_in_min_duration_ms=300)

    # 4 frames of speech = 120ms (backchannel like 'mm-hm' < 300ms)
    barge_in_fired = False
    for _ in range(4):
        frame = generate_pcm_frame(is_speech=True, duration_ms=30)
        _, _, is_barge_in = vad.process_frame(frame, agent_is_speaking=True)
        if is_barge_in:
            barge_in_fired = True

    assert not barge_in_fired, "Backchannel under 300ms should NOT trigger barge-in"

def test_vad_sustained_speech_triggers_barge_in():
    """Sustained utterance (>=300ms) during agent speaking MUST trigger barge-in."""
    vad = VoiceActivityDetector(silence_hangover_ms=650, barge_in_min_duration_ms=300)

    # 11 frames of 30ms = 330ms of continuous speech
    barge_in_fired = False
    for _ in range(11):
        frame = generate_pcm_frame(is_speech=True, duration_ms=30)
        _, _, is_barge_in = vad.process_frame(frame, agent_is_speaking=True)
        if is_barge_in:
            barge_in_fired = True
            break

    assert barge_in_fired, "Sustained speech >=300ms MUST trigger barge-in"

def test_vad_silence_hangover_endpointing():
    """Endpointing occurs only after silence hangover (650ms) is exceeded."""
    vad = VoiceActivityDetector(silence_hangover_ms=650, barge_in_min_duration_ms=300)

    # User speaks for 300ms (10 frames)
    for _ in range(10):
        frame = generate_pcm_frame(is_speech=True, duration_ms=30)
        vad.process_frame(frame, agent_is_speaking=False)

    assert vad.is_speech_active, "Speech should be marked active"

    # User pauses for 300ms (10 silent frames) -> should NOT endpoint yet
    endpoint_fired = False
    for _ in range(10):
        frame = generate_pcm_frame(is_speech=False, duration_ms=30)
        _, is_endpoint, _ = vad.process_frame(frame, agent_is_speaking=False)
        if is_endpoint:
            endpoint_fired = True

    assert not endpoint_fired, "Mid-turn pause <650ms should not endpoint"

    # Silence continues for another 400ms (14 frames, total > 650ms) -> MUST endpoint
    for _ in range(14):
        frame = generate_pcm_frame(is_speech=False, duration_ms=30)
        _, is_endpoint, _ = vad.process_frame(frame, agent_is_speaking=False)
        if is_endpoint:
            endpoint_fired = True
            break

    assert endpoint_fired, "Silence >=650ms MUST trigger endpointing"
