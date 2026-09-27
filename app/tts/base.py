from abc import ABC, abstractmethod
from typing import AsyncGenerator

class BaseTTS(ABC):
    """Abstract base class for Text-to-Speech providers."""

    @abstractmethod
    async def synthesize_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        """Synthesize text and yield audio chunks (PCM or WAV)."""
        pass
