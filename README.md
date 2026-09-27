# Arogya Shield — Real-Time Voice AI Sales & Policy Agent

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)
[![WebSockets](https://img.shields.io/badge/WebSockets-Full--Duplex-brightgreen.svg)](https://websockets.readthedocs.io/)
[![Sarvam AI](https://img.shields.io/badge/Sarvam%20AI-Active-orange.svg)](https://sarvam.ai)
[![Deepgram](https://img.shields.io/badge/Deepgram-Coming%20Soon-13EF93.svg)](https://deepgram.com)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Coming%20Soon-black.svg)](https://elevenlabs.io)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-Coming%20Soon-6566F1.svg)](https://openrouter.ai)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

A production-grade, hand-built real-time voice agent for conversational insurance sales and strictly grounded policy Q&A. Built entirely from first principles **without pre-canned voice-agent frameworks** (e.g. Pipecat, LiveKit, Vocode), featuring a **modular, pluggable multi-provider architecture** that provides full ownership over audio transport, turn-taking state machines, voice activity detection, barge-in cancellation, and streaming synthesis.

* **Current Active Provider:** Powered end-to-end by **[Sarvam AI](https://sarvam.ai)** (Saaras Streaming STT, Sarvam-105B LLM, and Bulbul Streaming TTS), optimized specifically for low-latency Indic and multilingual customer interactions.
* **Pluggable Architecture (Roadmap):** Decoupled abstract interfaces (`app/stt/base.py`, `app/tts/base.py`, and OpenAI-compatible streaming LLM client). Native integrations for **Deepgram** (Nova-3 STT), **ElevenLabs** (Flash TTS), and **OpenRouter** (Claude 3.5 Sonnet / GPT-4o / Llama 3) are on the roadmap.
* **Bring Your Own Key (BYOK):** Users can enter their personal API credentials directly in the browser's Voice Settings Drawer (stored securely in `localStorage`), enabling seamless testing and self-hosting without modifying server `.env` files.

---

## 1. High-Level Architecture & Pipeline

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BROWSER CLIENT                                       │
│                                                                                        │
│  [Microphone] ──► [AudioWorklet: 48k->16k] ──► [PCM 16k Stream] ──┐                   │
│  (echoCancellation, noiseSuppression)                             │                   │
│                                                                   │ WebSocket         │
│  [Speaker] ◄── [AudioContext Gapless Queue] ◄── [Audio Chunks] ◄──┘ (Full-Duplex)     │
│                      ▲                                                                 │
│                 Flush on Barge-In (< 50ms)                                             │
│                                                                                        │
│  [Visual Voice Orb]    [Live Transcript]    [Latency Dashboard]    [Settings Drawer]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ WebSocket (/ws/audio)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND ORCHESTRATOR                                      │
│                                                                                        │
│  ┌────────────────────┐      ┌─────────────────────────┐     ┌──────────────────────┐  │
│  │   Audio Receiver   │ ───► │  VAD & Turn Controller  │ ──► │ Pluggable STT Client │  │
│  │   (PCM 16k stream) │      │  (RMS/Energy + Hangover)│     │ • Sarvam Saaras (Now)│  │
│  └────────────────────┘      └───────────┬─────────────┘     │ • Deepgram Nova (Soon│  │
│                                          │                   └──────────┬───────────┘  │
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
│                              │  Pluggable TTS Client  │ ◄─── │ Pluggable LLM Agent  │  │
│                              │  • Sarvam Bulbul (Now) │      │ • Sarvam-105B (Now)  │  │
│                              │  • ElevenLabs (Soon)   │      │ • OpenRouter (Soon)  │  │
│                              └────────────────────────┘      └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### End-to-End Flow:
1. **Audio Capture**: Browser `AudioWorkletProcessor` downsamples microphone audio from hardware clock (44.1k/48k) to 16kHz 16-bit linear PCM and streams binary frames over a full-duplex WebSocket.
2. **VAD & Endpointing**: Server-side VAD computes real-time RMS energy, enforcing a 650ms silence hangover before finalizing user turns.
3. **Backchannel vs. Barge-In**: During agent speech, user sounds under 300ms (e.g. "mm-hm", "yeah", coughs) are ignored. Sustained speech (≥ 300ms) triggers instant barge-in.
4. **Streaming STT**: Audio streams concurrently to the STT provider (Sarvam Saaras `saaras:v3-realtime`), delivering live partial transcripts to the UI and final transcripts on speech endpointing.
5. **Grounded LLM**: An OpenAI-compatible conversational agent (`sarvam-105b-conversations` or OpenRouter models) generates responses strictly grounded in the loaded insurance policy with explicit "cite-or-refuse" guardrails.
6. **Sentence Chunker & TTS**: Streamed tokens pass through an abbreviation-aware sentence boundary splitter. The first sentence is immediately piped to the TTS provider (Sarvam Bulbul `bulbul:v3`), cutting Time to First Audio (TTFA) to under 1.5s.
7. **Gapless Playback & Instant Flush**: Browser schedules incoming audio buffers on the Web Audio API timeline. On barge-in, active buffers are terminated in `< 50ms` and pending backend tasks cancelled.

---

## 2. Pluggable Multi-Provider Architecture

The system is engineered with clear component boundaries, allowing individual pipeline stages to be swapped or extended without rewriting orchestration logic:

| Pipeline Stage | Active Provider | Upcoming Providers (Roadmap) | Interface Contract |
|---|---|---|---|
| **Speech-to-Text (STT)** | **Sarvam Saaras** (`saaras:v3-realtime`) | **Deepgram** (Nova-3 Streaming WebSocket) | `app/stt/base.py` (`BaseSTT`) |
| **Conversational Intelligence (LLM)** | **Sarvam 105B** (`sarvam-105b-conversations`) | **OpenRouter** (Claude 3.5 Sonnet, GPT-4o, Llama 3) | `app/llm/agent.py` (Streaming OpenAI API) |
| **Text-to-Speech (TTS)** | **Sarvam Bulbul** (`bulbul:v3`) | **ElevenLabs** (Flash v2.5 streaming) | `app/tts/base.py` (`BaseTTS`) |

### Zero-Lockin Architecture
* **Standard Audio Protocol:** All STT adapters accept the same 16,000 Hz 16-bit linear PCM binary stream over WebSocket.
* **Standard Token Streaming:** LLM interactions follow the standard OpenAI streaming chat completions schema, enabling direct drop-in routing to OpenRouter, Anthropic, or local vLLM instances.
* **Standard Audio Synthesis:** TTS adapters stream audio chunks back into the Turn State Machine, scheduling playback chunks onto the Web Audio API timeline.

---

## 3. Measured Latency Breakdown (Target: < 1.5s p50 TTFA)

| Pipeline Stage | Typical Duration | Notes |
|---|---|---|
| **VAD Silence Hangover** | `~650 ms` | Tunable (400ms – 1200ms) to prevent clipping natural mid-thought pauses |
| **STT Finalization** | `~180 ms` | Streaming WebSocket speech recognition |
| **LLM Time-to-First-Sentence (TTFS)** | `~280 ms` | Streaming tokens chunked at first sentence boundary |
| **TTS Time-to-First-Chunk (TTFB)** | `~190 ms` | Streaming audio chunk synthesis |
| **Total Turn Latency (TTFA)** | **~1,200 ms** | **Sub-1.5s responsive voice loop** |

---

## 4. Top Engineering Challenges & Resolutions

### 1. Browser Clock Drift & Sample Rate Mismatch
* **Challenge:** Modern browsers capture mic audio at the operating system's native hardware rate (typically 48,000 Hz or 44,100 Hz). Sending this directly to speech recognition models trained on 16,000 Hz causes acoustic distortion (the "chipmunk effect") or format rejection.
* **Resolution:** Hand-built an `AudioWorkletProcessor` (`public/audio-processor.js`) performing linear interpolation downsampling to exact 16,000 Hz 16-bit signed PCM frames (480 samples / 30ms per frame), ensuring zero audio drift and cutting WebSocket bandwidth by 66%.

### 2. Conversational Backchannels vs. Sustained Barge-In
* **Challenge:** Naive energy-based barge-in cuts the agent off if the user simply murmurs "mm-hm", "yeah", or clears their throat while listening.
* **Resolution:** Implemented a continuous speech accumulator in `app/vad.py`. When the agent is speaking, voiced frames are accumulated; if speech stops before 300ms, the audio is treated as a backchannel and the agent continues speaking smoothly. If speech sustains ≥ 300ms, the turn manager cancels in-flight LLM/TTS tasks and signals the browser to flush playback buffers instantly.

### 3. Punctuation Splitting on Indian Abbreviations & Currency
* **Challenge:** Streaming sentence chunkers that split on naive `.` mistakenly split on currency amounts (`Rs. 5,00,000`), honorifics (`Dr.`, `Mr.`), decimals (`5.5%`), and abbreviations (`e.g.`, `i.e.`), ruining speech synthesis cadence.
* **Resolution:** Engineered `app/llm/sentence_chunker.py` with lookahead and lookbehind regex rules that protect currency markers and abbreviations while cleanly stripping markdown artifacts (`**`, `###`, `- `) before synthesis.

---

## 5. Quickstart & Local Setup

### Prerequisites
* Python 3.9+
* Node.js 18+ and npm
* A Sarvam AI API Key ([Get one at sarvam.ai](https://www.sarvam.ai/)) — or configure it later via the frontend Voice Settings Drawer!

### 1. Clone Repository
```bash
git clone https://github.com/amitbhakt/insuranceguru.git
cd insuranceguru
```

### 2. Configure Environment (Optional with BYOK)
You can set your API key in `.env` OR use the in-app **Voice Settings Drawer** to provide your key:
```bash
cp .env.example .env
# Optional: Set SARVAM_API_KEY in .env
```

### 3. Install Dependencies
```bash
# Python backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend UI
npm install
```

### 4. Run Locally
**Terminal 1 — Python Backend:**
```bash
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend Dev Server:**
```bash
npm run dev
```

Open your browser to `http://localhost:5173` (or `http://localhost:8000` for production build).

---

## 6. Automated Verification & Test Suite

The repository includes a comprehensive automated test suite:

```bash
# Run unit tests (Sentence chunker & VAD barge-in thresholds)
pytest tests/test_sentence_chunker.py tests/test_vad_bargein.py -v

# Run the 20-Question Strict Groundedness Benchmark
pytest tests/test_groundedness.py -v
```

*Benchmark Spec:* 18 in-document questions answered with 100% factual accuracy; 2 out-of-document trap questions (drone collision, veterinary pet care) explicitly refused with 0 hallucinations.

---

## 7. Directory Map

```
insuranceguru/
├── app/
│   ├── main.py                 # FastAPI server & WebSocket (/ws/audio) endpoint
│   ├── config.py               # Tunable parameters & environment settings
│   ├── state_machine.py        # TurnManager (IDLE, LISTENING, THINKING, SPEAKING)
│   ├── vad.py                  # Energy/RMS VAD, hangover & barge-in accumulator
│   ├── audio_utils.py          # PCM conversion, WAV packaging & RMS calculators
│   ├── pdf_utils.py            # PDF document text extraction via pypdf
│   ├── stt/                    # Pluggable STT (Sarvam Saaras client; Deepgram ready)
│   ├── tts/                    # Pluggable TTS (Sarvam Bulbul client; ElevenLabs ready)
│   ├── llm/                    # Conversational agent & sentence boundary chunker
│   ├── prompts/                # Dedicated prompt file & few-shot examples
│   └── data/
│       └── policy_document.md  # Standard Arogya Shield health insurance policy
├── src/                        # React + Vite frontend
│   ├── routes/index.tsx        # Voice Console UI, Orb animations, Settings Drawer
│   └── services/               # useVoiceAgent hook & protocol definitions
├── public/
│   └── audio-processor.js      # AudioWorklet 48kHz -> 16kHz PCM downsampler
├── tests/                      # Automated unit tests and 20-question eval suite
├── AGENTS.md                   # Engineering guide for AI agents & contributors
├── .env.example
├── package.json
└── requirements.txt            # Python dependencies
```

---

## 8. License
MIT License. Free to use, adapt, and deploy.
