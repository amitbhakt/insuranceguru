import pytest
from app.llm.sentence_chunker import SentenceChunker, clean_spoken_text

def test_clean_spoken_text():
    raw = "**Welcome** to *Arogya* Shield! ### Benefits\n- Item 1\n* Item 2"
    cleaned = clean_spoken_text(raw)
    assert "**" not in cleaned
    assert "###" not in cleaned
    assert "- Item" not in cleaned
    assert "Welcome to Arogya Shield! Benefits Item 1 Item 2" == cleaned

def test_sentence_chunker_basic():
    chunker = SentenceChunker()
    tokens = ["Hello ", "world! ", "This ", "is ", "a test. ", "How ", "are you?"]
    sentences = []
    for t in tokens:
        for s in chunker.feed(t):
            sentences.append(s)
    for s in chunker.flush():
        sentences.append(s)

    assert sentences == ["Hello world!", "This is a test.", "How are you?"]

def test_sentence_chunker_abbreviations_and_currency():
    chunker = SentenceChunker()
    text = "The sum insured is Rs. 5,00,000 for Silver plan. Dr. Sharma recommended it. Pre-hospitalisation covers 60 days e.g. tests."
    tokens = text.split(" ")
    sentences = []
    for i, t in enumerate(tokens):
        token_with_space = t if i == len(tokens) - 1 else t + " "
        for s in chunker.feed(token_with_space):
            sentences.append(s)
    for s in chunker.flush():
        sentences.append(s)

    # Should NOT split on Rs. or Dr. or e.g.
    assert len(sentences) == 3
    assert sentences[0] == "The sum insured is Rs. 5,00,000 for Silver plan."
    assert sentences[1] == "Dr. Sharma recommended it."
    assert sentences[2] == "Pre-hospitalisation covers 60 days e.g. tests."
