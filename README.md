# Arogya Shield — Real-Time Voice AI Sales & Policy Agent

[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)
[![WebSockets](https://img.shields.io/badge/WebSockets-Full--Duplex-brightgreen.svg)](https://websockets.readthedocs.io/)
[![Sarvam AI](https://img.shields.io/badge/Sarvam%20AI-STT%20%7C%20TTS%20%7C%20LLM-orange.svg)](https://sarvam.ai)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

A production-grade, hand-built real-time voice agent for conversational insurance sales and strictly grounded policy Q&A. Built entirely from first principles **without pre-canned voice-agent frameworks** (e.g. Pipecat, LiveKit, Vocode), providing full ownership over audio transport, turn-taking, voice activity detection, barge-in cancellation, and streaming synthesis.

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

### End-to-End Flow:
1. **Audio Capture**: Browser `AudioWorkletProcessor` downsamples microphone audio from hardware clock (44.1k/48k) to 16kHz 16-bit linear PCM and streams binary frames over a full-duplex WebSocket.
2. **VAD & Endpointing**: Server-side VAD computes real-time RMS energy, enforcing a 650ms silence hangover before finalizing user turns.
3. **Backchannel vs. Barge-In**: During agent speech, user sounds under 300ms (e.g. "mm-hm", "yeah", coughs) are ignored. Sustained speech (≥ 300ms) triggers instant barge-in.
4. **Streaming STT**: Audio streams concurrently to Sarvam Saaras STT (`saaras:v3-realtime`), providing live partial transcripts to the UI and final transcripts on speech endpointing.
5. **Grounded LLM**: An OpenAI-compatible Sarvam LLM instance (`sarvam-105b-conversations`) generates responses strictly grounded in `app/data/policy_document.md` with explicit "cite-or-refuse" guardrails.
6. **Sentence Chunker & TTS**: Tokens stream through an abbreviation-aware sentence boundary splitter. The first sentence is immediately synthesized via Sarvam Bulbul (`bulbul:v3`), cutting Time to First Audio (TTFA) to under 1.5s.
7. **Gapless Playback & Instant Flush**: Browser schedules incoming audio buffers on the Web Audio API timeline. On barge-in, active buffers are immediately terminated (< 50ms) and pending backend tasks cancelled.

---

## 2. Measured Latency Breakdown (Target: < 1.5s p50 TTFA)

| Pipeline Stage | Typical Duration | Notes |
|---|---|---|
| **VAD Silence Hangover** | `~650 ms` | Tunable (400ms – 1200ms) to prevent clipping natural mid-thought pauses |
| **STT Finalization** | `~180 ms` | Sarvam Saaras realtime streaming WebSocket |
| **LLM Time-to-First-Sentence (TTFS)** | `~280 ms` | Streaming tokens chunked at first sentence boundary |
| **TTS Time-to-First-Chunk (TTFB)** | `~190 ms` | Sarvam Bulbul streaming audio chunk generation |
| **Total Turn Latency (TTFA)** | **~1,200 ms** | **Sub-1.5s responsive voice loop** |

---

## 3. Top Engineering Challenges & Resolutions

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

## 4. Quickstart & Local Setup

### Prerequisites
* Python 3.9+
* Node.js 18+ and npm
* A Sarvam AI API Key ([Get one at sarvam.ai](https://www.sarvam.ai/))

### 1. Clone & Configure
```bash
git clone https://github.com/amitbhakt/insuranceguru.git
cd insuranceguru

# Configure environment variables
cp .env.example .env
# Edit .env and insert your SARVAM_API_KEY
```

### 2. Install Dependencies
```bash
# Python backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend UI
npm install
```

### 3. Run Locally (One Command or Dual Terminal)
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

## 5. Automated Verification & Test Suite

The repository includes a comprehensive automated test suite:

```bash
# Run unit tests (Sentence chunker & VAD barge-in thresholds)
pytest tests/test_sentence_chunker.py tests/test_vad_bargein.py -v

# Run the 20-Question Strict Groundedness Benchmark
pytest tests/test_groundedness.py -v
```

*Benchmark Spec:* 18 in-document questions answered with 100% factual accuracy; 2 out-of-document trap questions (drone collision, veterinary pet care) explicitly refused with 0 hallucinations.

---

## 6. Directory Map

```
insuranceguru/
├── app/
│   ├── main.py                 # FastAPI server & WebSocket (/ws/audio) endpoint
│   ├── config.py               # Tunable parameters & environment settings
│   ├── state_machine.py        # TurnManager (IDLE, LISTENING, THINKING, SPEAKING)
│   ├── vad.py                  # Energy/RMS VAD, hangover & barge-in accumulator
│   ├── audio_utils.py          # PCM conversion, WAV packaging & RMS calculators
│   ├── stt/                    # Sarvam Saaras realtime streaming STT
│   ├── tts/                    # Sarvam Bulbul streaming TTS client with fallback
│   ├── llm/                    # Conversational agent & sentence boundary chunker
│   ├── prompts/                # Dedicated prompt file & few-shot examples
│   └── data/
│       └── policy_document.md  # Standard Arogya Shield health insurance policy
├── src/                        # React + Vite frontend
│   ├── routes/index.tsx        # Voice Console UI, Orb animations, Metrics card
│   └── services/               # useVoiceAgent hook & protocol definitions
├── public/
│   └── audio-processor.js      # AudioWorklet 48kHz -> 16kHz PCM downsampler
├── tests/                      # Automated unit tests and 20-question eval suite
├── AGENTS.md                   # Engineering guide for AI agents & contributors
└── requirements.txt            # Python dependencies
```

---

## 7. License
MIT License. Free to use, adapt, and deploy.
