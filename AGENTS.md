# AGENTS.md — Contributor & AI Agent Engineering Guide

This document defines the architectural principles, code conventions, component boundaries, and operational procedures for any AI agent or software engineer contributing to this repository.

---

## 1. Project Mission & High-Level Architecture

**Arogya Shield** is a production-grade, hand-built real-time voice agent for conversational insurance sales and strictly grounded policy Q&A. 

The system operates **without pre-canned voice-agent frameworks** (e.g., Pipecat, LiveKit, Vocode), constructing the entire pipeline from first principles:
1. **Browser Audio**: `AudioWorkletProcessor` captures raw microphone audio, performs linear-interpolation downsampling from native hardware rate (44.1k/48k) to 16kHz 16-bit linear PCM, and streams binary frames over a full-duplex WebSocket.
2. **Turn State Machine & VAD**: The backend evaluates voice activity, enforces a 600–800ms silence hangover for endpointing, and discriminates backchannels ("mm-hm", "yeah" < 300ms) from sustained barge-in (≥ 300ms).
3. **Streaming Speech-to-Text (STT)**: Streams audio frames to Sarvam Saaras Realtime STT, delivering live partial transcripts to the UI and final transcripts on speech endpointing.
4. **Grounded Conversational LLM**: An OpenAI-compatible Sarvam LLM instance (`sarvam-105b-conversations` or `sarvam-105b`) guided by strict "cite-or-refuse" system prompts grounded exclusively in `data/policy_document.md`.
5. **Sentence Chunker & Streaming TTS**: An abbreviation-aware sentence splitter chunks streamed LLM tokens on punctuation boundaries, piping the very first sentence to Sarvam Bulbul TTS to achieve sub-1.5s Time to First Audio (TTFA).
6. **Gapless Audio Playback & Barge-In**: Browser schedules audio chunks on the Web Audio API timeline. When an interrupt is triggered, all active audio buffers are flushed instantly (< 50ms), and in-flight backend tasks are cancelled.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BROWSER CLIENT                                       │
│                                                                                        │
│  [Microphone] ──► [AudioWorklet: 48k->16k] ──► [PCM 16k Stream] ──┐                   │
│  (echoCancellation, noiseSuppression)                             │                   │
│                                                                   │ WebSocket         │
│  [Speaker] ◄── [AudioContext Gapless Queue] ◄── [Audio Chunks] ◄──┘ (Full-Duplex)     │
│                      ▲                                                                 │
│                 Flush on Barge-In                                                      │
│                                                                                        │
│  [Visual Voice Orb]    [Live Transcript]    [Latency Dashboard]    [Settings Drawer]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ WebSocket
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND ORCHESTRATOR                                      │
│                                                                                        │
│  ┌────────────────────┐      ┌─────────────────────────┐     ┌──────────────────────┐  │
│  │   Audio Receiver   │ ───► │  VAD & Turn Controller  │ ──► │  Sarvam Saaras STT   │  │
│  │   (PCM 16k stream) │      │  (RMS/Energy + Hangover)│     │  (Streaming WS)      │  │
│  └────────────────────┘      └───────────┬─────────────┘     └──────────┬───────────┘  │
│                                          │                              │              │
│                           Barge-in / End-of-Speech                      │ Transcript   │
│                                          │                              ▼              │
│                                          ▼                   ┌──────────────────────┐  │
│                              ┌────────────────────────┐      │  Turn State Machine  │  │
│                              │  Playback Canceller &  │ ◄─── │  (LISTENING, THINK,  │  │
│                              │  Task Abort Signal     │      │   SPEAKING, BARGEIN) │  │
│                              └────────────────────────┘      └──────────┬───────────┘  │
│                                                                         │ Final Turn   │
│                                                                         ▼              │
│                              ┌────────────────────────┐      ┌──────────────────────┐  │
│                              │  Sarvam Bulbul TTS     │ ◄─── │  Grounded LLM Agent  │  │
│                              │  (Streaming WS Chunks) │      │  (Sentence Chunker & │  │
│                              └────────────────────────┘      │   Strict Guardrails) │  │
│                                                              └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure & Key Responsibilities

```
insuranceguru/
├── app/
│   ├── main.py                 # FastAPI server, static assets, and /ws/audio endpoint
│   ├── config.py               # Application settings, provider keys, and VAD thresholds
│   ├── state_machine.py        # TurnManager (IDLE, LISTENING, THINKING, SPEAKING) & Task cancellation
│   ├── vad.py                  # Energy/RMS VAD, silence hangover, and barge-in accumulator
│   ├── audio_utils.py          # PCM format conversions, chunk buffers, and audio helpers
│   ├── pdf_utils.py            # PDF document text extractor via pypdf
│   ├── stt/
│   │   ├── base.py             # Abstract STT provider interface
│   │   └── sarvam_stt.py       # Sarvam Saaras streaming STT client
│   ├── tts/
│   │   ├── base.py             # Abstract TTS provider interface
│   │   └── sarvam_tts.py       # Sarvam Bulbul streaming TTS client
│   ├── llm/
│   │   ├── agent.py            # Grounded conversational agent & multi-turn memory
│   │   └── sentence_chunker.py # Abbreviation-aware sentence boundary splitter
│   ├── prompts/
│   │   └── agent_prompt.py     # Persona, tone, guardrails, few-shot examples & doc injection
│   └── data/
│       └── policy_document.md  # Comprehensive insurance policy document (grounding source)
├── src/                        # Frontend UI (React + Vite + Tailwind + shadcn/ui)
│   ├── routes/index.tsx        # Voice Console UI, Voice Orb, Transcript, Metrics Dashboard
│   ├── services/
│   │   ├── useVoiceAgent.ts    # React hook managing Web Audio API, WebSocket & UI state
│   │   └── voiceAgentService.ts# Type definitions & protocol message contracts
│   └── public/
│       └── audio-processor.js  # AudioWorkletProcessor for 48kHz -> 16kHz PCM downsampling
├── tests/
│   ├── test_groundedness.py    # 20-question groundedness verification suite
│   ├── test_sentence_chunker.py# Unit tests for sentence splitter on abbreviations
│   └── test_vad_bargein.py     # Unit tests for backchannel vs barge-in thresholds
├── .env.example
├── requirements.txt
├── package.json
└── AGENTS.md                   # This contributor & AI agent guide
```

---

## 3. Boundaries: What to Change vs. What NOT to Change

### 3.1 What You ARE Encouraged to Modify
* **`app/data/policy_document.md`**: Update, expand, or replace policy terms, waiting periods, limits, or exclusions.
* **`app/prompts/agent_prompt.py`**: Refine conversation persona, discovery framing, few-shot examples, or safety refusals.
* **`app/config.py` & `.env`**: Tune operational hyperparameters:
  - `VAD_SILENCE_HANGOVER_MS` (default: 650ms)
  - `VAD_BARGE_IN_MIN_DURATION_MS` (default: 300ms)
  - `SARVAM_VOICE_SPEAKER` (default: `shubh` or `amartya`)
  - `LLM_MODEL_NAME` (default: `sarvam-105b-conversations`)
* **`src/routes/index.tsx` & Styling**: Enhance visual indicators, metrics display, or accessibility without altering the WebSocket protocol schema.

### 3.2 What You MUST NOT Modify Without Rigorous Review
* **`src/public/audio-processor.js` (AudioWorklet)**: Do NOT alter the downsampling logic or frame accumulation. It ensures clean 16,000 Hz 16-bit linear PCM. Breaking this causes acoustic model format rejection or distortion.
* **`app/state_machine.py` (Concurrency & Task Cancellation)**: Do NOT remove asynchronous task tracking (`asyncio.Task.cancel()`). Without clean cancellation, old LLM streams and TTS audio packets will leak into newly interrupted user turns.
* **`app/llm/sentence_chunker.py`**: Do NOT replace with a naive `text.split('.')`. The regex is tuned specifically to protect Indian currency (`Rs. 5,00,000`), decimals (`5.5%`), honorifics (`Dr.`, `Mr.`), and abbreviations (`e.g.`, `i.e.`, `No.`).
* **Strict "Cite-or-Refuse" Prompting**: Never loosen the prompt instruction to allow guessing or "typical industry standards". If an item is not in `policy_document.md`, the agent must explicitly refuse.

---

## 4. WebSocket Control Protocol Specification

The client and server communicate over a single full-duplex WebSocket connection at `/ws/audio`.

### 4.1 Client ➔ Server
* **Binary frames**: Continuous raw 16kHz 16-bit mono linear PCM audio chunks (20ms–30ms per frame).
* **JSON messages**:
  ```json
  { "type": "start_session", "custom_policy": "Optional raw policy text override" }
  { "type": "stop_session" }
  { "type": "text_input", "text": "What is the waiting period for pre-existing diseases?" }
  { "type": "update_config", "silence_hangover_ms": 700, "barge_in_ms": 300 }
  ```

### 4.2 Server ➔ Client
* **Binary frames**: Synthesized PCM/WAV audio chunks from TTS for immediate playback via Web Audio API.
* **JSON messages**:
  ```json
  { "type": "status_update", "status": "warming_up" | "ready", "message": "Analyzing policy document..." }
  { "type": "state_change", "state": "listening" | "thinking" | "speaking" | "interrupted" }
  { "type": "partial_transcript", "text": "What is the..." }
  { "type": "final_transcript", "text": "What is the waiting period for diabetes?" }
  { "type": "agent_chunk", "text": "For pre-existing conditions like diabetes...", "is_final": false }
  { "type": "interrupt" }
  { "type": "latency_metrics", "ttfa": 1050, "vadMs": 650, "sttMs": 180, "llmMs": 280, "ttsMs": 190 }
  { "type": "error", "message": "Description of issue" }
  ```

---

## 5. Testing & Verification Procedures

Before pushing changes or opening a PR, always execute the automated verification suite:

1. **Sentence Boundary Verification**:
   ```bash
   pytest tests/test_sentence_chunker.py
   ```
2. **VAD & Barge-In Logic Verification**:
   ```bash
   pytest tests/test_vad_bargein.py
   ```
3. **20-Question Strict Groundedness Benchmark**:
   ```bash
   python -m pytest tests/test_groundedness.py -v
   ```
   *Expectation:* 18 in-document questions answered with 100% factual accuracy; 2 out-of-document trap questions explicitly refused with 0 hallucinations.

---

## 6. Code Style & Conventions
* **Python**: Strict type annotations (`typing`), `asyncio` for all I/O, PEP 8 compliance.
* **TypeScript/React**: Functional components, typed hooks, strict null checks, zero `any` types where possible.
* **Environment Variables**: Never commit secrets or API keys. Always rely on `.env` loaded via `pydantic-settings` or `python-dotenv`.
