import asyncio
import pytest
from app.state_machine import TurnManager, AgentState
from app.llm.agent import ConversationalAgent
from app.tts.sarvam_tts import SarvamStreamingTTS

class DummyAgent:
    def __init__(self):
        self.system_prompt = "test"
        self.messages = []

    async def stream_response(self, text):
        yield "Haan ji, main check karti hoon. "
        yield "Take care."

class DummyTTS:
    async def synthesize_stream(self, text):
        # 10ms dummy audio chunk
        yield b"\x00" * 480

@pytest.mark.asyncio
async def test_farewell_detection_and_call_closure():
    sent_json = []
    call_ended_called = False

    async def mock_send_json(data):
        sent_json.append(data)

    async def mock_send_audio(chunk):
        pass

    async def mock_on_call_ended():
        nonlocal call_ended_called
        call_ended_called = True

    tm = TurnManager(
        send_json=mock_send_json,
        send_audio=mock_send_audio,
        agent=DummyAgent(),
        tts=DummyTTS(),
        on_call_ended=mock_on_call_ended
    )

    # Test farewell from user
    assert tm._is_farewell("thank you, bye", "normal response") is True
    assert tm._is_farewell("call disconnect kar do", "normal response") is True
    assert tm._is_farewell("bas itna hi", "normal response") is True
    assert tm._is_farewell("normal question", "Theek hai ji. Take care.") is True
    assert tm._is_farewell("normal question", "Kabhi bhi policy se related kuch puchna ho to main yahin hoon.") is True
    assert tm._is_farewell("waiting period kitna hai?", "Waiting period 3 saal hai.") is False

    # Simulate turn with farewell
    await tm.handle_speech_endpoint("thank you bye", vad_duration_ms=650)
    
    # Client simulates playback ending quickly
    await asyncio.sleep(0.1)
    tm.notify_playback_ended()

    # Wait for the turn task to finish
    await asyncio.wait_for(tm.active_turn_task, timeout=3.0)

    # Verify call_ended message was sent and callback was called
    types = [msg.get("type") for msg in sent_json]
    assert "call_ended" in types, f"Expected call_ended in {types}"
    assert call_ended_called is True

@pytest.mark.asyncio
async def test_barge_in_during_speaking_interrupts_and_listens():
    sent_json = []

    async def mock_send_json(data):
        sent_json.append(data)

    async def mock_send_audio(chunk):
        pass

    tm = TurnManager(
        send_json=mock_send_json,
        send_audio=mock_send_audio,
        agent=DummyAgent(),
        tts=DummyTTS()
    )

    await tm.set_state(AgentState.SPEAKING)
    assert tm.state == AgentState.SPEAKING

    # Trigger barge-in
    await tm.handle_barge_in()

    types = [msg.get("type") for msg in sent_json]
    assert "interrupt" in types
    assert tm.state == AgentState.LISTENING
