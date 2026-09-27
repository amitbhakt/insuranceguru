import re
from typing import Generator

# Regexes for terms that end with a dot but should NOT be treated as end-of-sentence
PROTECTED_PREFIXES = [
    r"\bRs\.",
    r"\bDr\.",
    r"\bMr\.",
    r"\bMrs\.",
    r"\bMs\.",
    r"\be\.g\.",
    r"\bi\.e\.",
    r"\bNo\.",
    r"\bvs\.",
    r"\bapprox\.",
    r"\d+\.\d+",
]

PROTECTED_REGEX = re.compile(
    r"(" + "|".join(PROTECTED_PREFIXES) + r")\s*$",
    re.IGNORECASE
)

def clean_spoken_text(text: str) -> str:
    """Strips markdown formatting, hashtags, and symbols that sound awkward when read by TTS."""
    # Remove markdown bold/italic asterisks and underscores
    text = re.sub(r"[*_]{1,3}", "", text)
    # Remove hashtags/markdown headers anywhere
    text = re.sub(r"#+", "", text)
    # Remove bullet markers (- or *) at start of line
    text = re.sub(r"^\s*[-*]\s+", "", text, flags=re.MULTILINE)
    # Clean up excess whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text

class SentenceChunker:
    """
    Buffers streaming LLM tokens and yields complete sentences while protecting
    common abbreviations, currency (Rs.), and decimal numbers.
    """
    def __init__(self):
        self.buffer = ""
        self.split_regex = re.compile(r"([.?!]+(?:\s+|\n+)|(?:\n\n+))")

    def feed(self, token: str) -> Generator[str, None, None]:
        self.buffer += token

        search_pos = 0
        while True:
            match = self.split_regex.search(self.buffer, pos=search_pos)
            if not match:
                break

            # Text up to the matched punctuation
            text_up_to_punct = self.buffer[:match.end()]

            # Check if this match is part of an abbreviation (e.g., 'Rs.', 'Dr.')
            # or a decimal number ('5.5')
            if PROTECTED_REGEX.search(text_up_to_punct):
                # Move search position forward past this punctuation and continue
                search_pos = match.end()
                continue

            # Found a genuine sentence boundary
            sentence = self.buffer[:match.end()].strip()
            self.buffer = self.buffer[match.end():].lstrip()
            search_pos = 0

            cleaned = clean_spoken_text(sentence)
            if cleaned:
                yield cleaned

    def flush(self) -> Generator[str, None, None]:
        remaining = clean_spoken_text(self.buffer)
        self.buffer = ""
        if remaining:
            yield remaining
