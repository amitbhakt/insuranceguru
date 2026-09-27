import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Sarvam AI Credentials
    SARVAM_API_KEY: str = ""

    # STT Settings
    SARVAM_STT_WS_URL: str = "wss://api.sarvam.ai/speech-to-text-realtime/ws"
    SARVAM_STT_MODEL: str = "saaras:v3-realtime"
    STT_LANGUAGE_CODE: str = "auto"

    # TTS Settings
    SARVAM_TTS_WS_URL: str = "wss://api.sarvam.ai/text-to-speech/ws"
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SARVAM_TTS_SPEAKER: str = "pooja"
    TTS_LANGUAGE_CODE: str = "en-IN"
    TTS_SAMPLE_RATE: int = 16000

    # LLM Settings
    SARVAM_LLM_URL: str = "https://api.sarvam.ai/v1/chat/completions"
    SARVAM_LLM_MODEL: str = "sarvam-105b-conversations"
    LLM_TEMPERATURE: float = 0.6
    LLM_MAX_TOKENS: int = 250

    # VAD & Turn-Taking Tunables
    VAD_SILENCE_HANGOVER_MS: int = 650
    VAD_BARGE_IN_MIN_DURATION_MS: int = 300
    VAD_ENERGY_THRESHOLD: float = 0.015

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

settings = Settings()
