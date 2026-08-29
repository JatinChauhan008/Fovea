"""Turn raw extracted page text into RSVP-ready tokens.

A token carries everything the reader UI needs to display one word:
its text, which letter to highlight (the Optimal Recognition Point),
how long to hold it relative to the base delay, and which page it came from.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, asdict

# Words longer than this are treated as "complex" and held longer.
LONG_WORD_LEN = 12

# Multipliers applied to the base delay (60 / wpm).
COMMA_FACTOR = 1.3
SENTENCE_FACTOR = 2.0
LONG_WORD_FACTOR = 1.5
MAX_FACTOR = 3.0

SENTENCE_END = tuple(".!?")
CLAUSE_END = tuple(",;:")

# Ligatures and typographic characters PDFs love and tokenizers hate.
_REPLACEMENTS = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "−": "-",
    " ": " ", "​": "",
}

_HYPHEN_LINEBREAK = re.compile(r"(\w)-\s*\n\s*(\w)")
_WHITESPACE = re.compile(r"[ \t\r\f\v]+")
_NEWLINES = re.compile(r"\n{2,}")
# A token is a run of non-space characters; punctuation stays attached to the word
# because pacing depends on it.
_TOKEN = re.compile(r"\S+")


@dataclass(slots=True)
class Token:
    t: str  # display text
    o: int  # optimal recognition point (index into t)
    m: float  # delay multiplier
    p: int  # 1-based page number

    def as_dict(self) -> dict:
        return asdict(self)


def get_orp_index(word: str) -> int:
    """Which letter to highlight, by word length (see README for the table)."""
    length = len(word)
    if length <= 1:
        return 0
    if length <= 5:
        return 1
    if length <= 9:
        return 2
    if length <= 13:
        return 3
    return 4


def get_delay_multiplier(word: str) -> float:
    """Longer holds for sentence ends, clause breaks, and long words."""
    factor = 1.0
    stripped = word.rstrip("\"')]}")

    if stripped.endswith(SENTENCE_END):
        factor *= SENTENCE_FACTOR
    elif stripped.endswith(CLAUSE_END):
        factor *= COMMA_FACTOR

    # Length is judged on the letters, not the punctuation hanging off them.
    if len(re.sub(r"[^\w]", "", word)) >= LONG_WORD_LEN:
        factor *= LONG_WORD_FACTOR

    return round(min(factor, MAX_FACTOR), 3)


def normalise(text: str) -> str:
    for bad, good in _REPLACEMENTS.items():
        text = text.replace(bad, good)
    # Words split across a line break by a hyphen are rejoined.
    text = _HYPHEN_LINEBREAK.sub(r"\1\2", text)
    text = _WHITESPACE.sub(" ", text)
    return _NEWLINES.sub("\n", text).strip()


def find_boilerplate(pages: list[str], threshold: float = 0.6) -> set[str]:
    """Short lines repeated across most pages are running heads / page numbers."""
    if len(pages) < 4:
        return set()

    counts: Counter[str] = Counter()
    for page in pages:
        seen = {
            line.strip()
            for line in page.splitlines()
            if 0 < len(line.strip()) <= 80
        }
        counts.update(seen)

    cutoff = max(3, int(len(pages) * threshold))
    return {line for line, n in counts.items() if n >= cutoff}


def strip_lines(page: str, boilerplate: set[str]) -> str:
    if not boilerplate:
        return page
    kept = [line for line in page.splitlines() if line.strip() not in boilerplate]
    return "\n".join(kept)


def tokenize_pages(pages: list[str]) -> list[Token]:
    """Build the full token stream for a document, page by page."""
    boilerplate = find_boilerplate(pages)
    tokens: list[Token] = []

    for page_number, raw in enumerate(pages, start=1):
        cleaned = normalise(strip_lines(raw, boilerplate))
        for match in _TOKEN.finditer(cleaned):
            word = match.group()
            # Drop tokens with no readable characters (stray bullets, rule artifacts).
            if not any(ch.isalnum() for ch in word):
                continue
            tokens.append(
                Token(
                    t=word,
                    o=get_orp_index(word),
                    m=get_delay_multiplier(word),
                    p=page_number,
                )
            )

    return tokens


def tokens_to_text(tokens: list[dict], start: int = 0, end: int | None = None) -> str:
    """Reassemble a slice of the stream into prose (for summaries and quizzes)."""
    window = tokens[start:end] if end is not None else tokens[start:]
    return " ".join(tok["t"] for tok in window)
