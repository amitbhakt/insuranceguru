from abc import ABC, abstractmethod
from typing import AsyncGenerator, Callable, Optional

class BaseSTT(ABC):
    """Abstract base class for Streaming Speech-to-Text providers."""

    @abstractmethod
    async def connect(self):
        """Establish connection to the STT service."""
        pass

    @abstractmethod
    async def send_audio(self, pcm_bytes: bytes):
        """Send raw PCM audio chunk to the STT service."""
        pass

    @abstractmethod
    async def close(self):
        """Close connection to the STT service."""
        pass
