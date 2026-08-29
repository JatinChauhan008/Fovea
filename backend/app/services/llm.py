"""Summaries and comprehension quizzes.

Primary path: Sarvam's chat completions API with a JSON schema response format.
Fallback path: a local heuristic generator, so the adaptive loop keeps working
when no API key is configured or the provider is unreachable.
"""

from __future__ import annotations

import json
import logging
import random
import re
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 14_000

QUIZ_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "answer_index": {"type": "integer", "minimum": 0, "maximum": 3},
                    "explanation": {"type": "string"},
                },
                "required": ["question", "options", "answer_index", "explanation"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}

QUIZ_SYSTEM = (
    "You write comprehension checks for a speed-reading app. You are given a passage "
    "the reader has just read at high speed. Write multiple-choice questions that test "
    "whether they actually absorbed the passage's content.\n"
    "Rules:\n"
    "- Every question must be answerable from the passage alone.\n"
    "- Exactly four options, exactly one unambiguously correct.\n"
    "- Distractors must be plausible and drawn from the passage's subject matter.\n"
    "- Test substance (claims, relationships, figures), never trivia like formatting.\n"
    "- Keep questions under 25 words."
)

SUMMARY_SYSTEM = (
    "You summarise documents for a speed-reading app. Produce a tight, faithful summary "
    "in 4-6 sentences: what the document is about, its main claims, and its conclusion. "
    "Plain prose, no headings, no bullet points, no preamble."
)


class AIError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# Sarvam client
# --------------------------------------------------------------------------

async def _sarvam_chat(
    messages: list[dict[str, str]],
    *,
    max_tokens: int = 2048,
    temperature: float = 0.2,
    response_format: dict | None = None,
) -> str:
    settings = get_settings()
    if not settings.sarvam_api_key:
        raise AIError("SARVAM_API_KEY is not configured")

    payload: dict[str, Any] = {
        "model": settings.sarvam_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    headers = {
        "api-subscription-key": settings.sarvam_api_key,
        "Authorization": f"Bearer {settings.sarvam_api_key}",
        "Content-Type": "application/json",
    }

    url = f"{settings.sarvam_base_url.rstrip('/')}/chat/completions"

    async with httpx.AsyncClient(timeout=settings.sarvam_timeout_seconds) as client:
        response = await client.post(url, json=payload, headers=headers)

    if response.status_code >= 400:
        raise AIError(f"Sarvam API returned {response.status_code}: {response.text[:300]}")

    try:
        data = response.json()
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, ValueError) as exc:
        raise AIError(f"Unexpected Sarvam response shape: {exc}") from exc


def _extract_json(raw: str) -> dict:
    """Models sometimes wrap JSON in prose or fences. Dig the object out."""
    text = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIError("Model did not return valid JSON") from exc
    raise AIError("Model did not return valid JSON")


def _clip(text: str, limit: int = MAX_CONTEXT_CHARS) -> str:
    if len(text) <= limit:
        return text
    # Keep the head and tail - the opening frames the passage, the ending carries conclusions.
    head = int(limit * 0.65)
    tail = limit - head
    return f"{text[:head]}\n\n[...]\n\n{text[-tail:]}"


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

async def generate_summary(text: str) -> tuple[str, str]:
    """Return (summary, source) where source is 'ai' or 'heuristic'."""
    settings = get_settings()
    passage = _clip(text)

    if settings.ai_enabled:
        try:
            content = await _sarvam_chat(
                [
                    {"role": "system", "content": SUMMARY_SYSTEM},
                    {"role": "user", "content": f"Summarise this document:\n\n{passage}"},
                ],
                max_tokens=700,
                temperature=0.3,
            )
            summary = content.strip()
            if summary:
                return summary, "ai"
        except (AIError, httpx.HTTPError) as exc:
            logger.warning("Sarvam summary failed, falling back to extractive: %s", exc)

    return _extractive_summary(text), "heuristic"


async def generate_quiz(text: str, num_questions: int = 4) -> tuple[list[dict], str]:
    """Return (questions, source)."""
    settings = get_settings()
    passage = _clip(text)

    if settings.ai_enabled:
        prompt = (
            f"Write exactly {num_questions} multiple-choice comprehension questions "
            f"about this passage.\n\nPASSAGE:\n{passage}"
        )
        messages = [
            {"role": "system", "content": QUIZ_SYSTEM},
            {"role": "user", "content": prompt},
        ]

        # Prefer a strict schema; fall back to plain JSON mode if the provider
        # rejects the schema form, then to the local generator.
        formats: list[dict | None] = [
            {
                "type": "json_schema",
                "json_schema": {"name": "quiz", "strict": True, "schema": QUIZ_SCHEMA},
            },
            {"type": "json_object"},
        ]

        for response_format in formats:
            try:
                content = await _sarvam_chat(
                    messages,
                    max_tokens=2048,
                    temperature=0.4,
                    response_format=response_format,
                )
                questions = _validate_questions(_extract_json(content), num_questions)
                if questions:
                    return questions, "ai"
            except (AIError, httpx.HTTPError) as exc:
                logger.warning("Sarvam quiz attempt failed (%s): %s", response_format, exc)

    return _heuristic_quiz(text, num_questions), "heuristic"


def _validate_questions(data: dict, expected: int) -> list[dict]:
    raw = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        raise AIError("Response contained no questions array")

    questions: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        question = str(item.get("question", "")).strip()
        options = [str(o).strip() for o in item.get("options", []) if str(o).strip()]
        answer_index = item.get("answer_index")

        if not question or len(options) != 4 or not isinstance(answer_index, int):
            continue
        if not 0 <= answer_index < 4:
            continue

        questions.append(
            {
                "question": question,
                "options": options,
                "answer_index": answer_index,
                "explanation": (str(item.get("explanation") or "").strip() or None),
            }
        )

    return questions[:expected]


# --------------------------------------------------------------------------
# Local fallbacks
# --------------------------------------------------------------------------

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_WORD = re.compile(r"[A-Za-z][A-Za-z'-]{4,}")

STOPWORDS = {
    "about", "above", "after", "again", "against", "already", "although", "always",
    "among", "another", "because", "become", "before", "being", "below", "between",
    "both", "cannot", "could", "does", "doing", "during", "each", "either", "every",
    "further", "given", "having", "hence", "however", "into", "itself", "known",
    "later", "least", "like", "made", "makes", "many", "more", "most", "much", "must",
    "neither", "never", "often", "only", "other", "over", "rather", "same", "should",
    "since", "some", "such", "than", "that", "their", "them", "then", "there", "these",
    "they", "this", "those", "through", "thus", "under", "until", "using", "very",
    "when", "where", "which", "while", "will", "with", "within", "without", "would",
    "your", "also", "been", "from", "have", "here", "just", "were", "what", "whom",
}


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text) if len(s.split()) >= 6]


def _keywords(text: str) -> list[str]:
    seen: dict[str, int] = {}
    for match in _WORD.finditer(text):
        word = match.group()
        if word.lower() in STOPWORDS:
            continue
        seen[word] = seen.get(word, 0) + 1
    return sorted(seen, key=lambda w: (-seen[w], -len(w)))


def _extractive_summary(text: str, max_sentences: int = 5) -> str:
    """Frequency-weighted extractive summary - no model required."""
    sentences = _sentences(text)
    if not sentences:
        return text[:500].strip() or "This document contains no extractable prose."

    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    frequencies: dict[str, int] = {}
    for word in _WORD.findall(text.lower()):
        if word not in STOPWORDS:
            frequencies[word] = frequencies.get(word, 0) + 1

    if not frequencies:
        return " ".join(sentences[:max_sentences])

    peak = max(frequencies.values())

    def score(index_sentence: tuple[int, str]) -> float:
        index, sentence = index_sentence
        words = [w for w in _WORD.findall(sentence.lower()) if w not in STOPWORDS]
        if not words:
            return 0.0
        density = sum(frequencies.get(w, 0) for w in words) / (len(words) * peak)
        # Opening sentences carry disproportionate framing value.
        position_bonus = 1.15 if index < 3 else 1.0
        return density * position_bonus

    ranked = sorted(enumerate(sentences), key=score, reverse=True)[:max_sentences]
    return " ".join(sentence for _, sentence in sorted(ranked, key=lambda pair: pair[0]))


def _heuristic_quiz(text: str, num_questions: int) -> list[dict]:
    """Cloze-style questions built from the passage itself."""
    rng = random.Random(len(text))
    sentences = _sentences(text)
    pool = _keywords(text)

    if not sentences or len(pool) < 4:
        return []

    questions: list[dict] = []
    used_answers: set[str] = set()

    # Prefer information-dense sentences of readable length. Documents repeat
    # themselves - boilerplate, restated claims - and asking about the same
    # sentence twice both wastes a question and leaks the other one's answer.
    seen_sentences: set[str] = set()
    unique: list[str] = []
    for sentence in sentences:
        if not 8 <= len(sentence.split()) <= 38:
            continue
        key = " ".join(sentence.lower().split())
        if key in seen_sentences:
            continue
        seen_sentences.add(key)
        unique.append(sentence)

    candidates = sorted(
        unique,
        key=lambda s: -sum(1 for w in _WORD.findall(s) if w in pool[:40]),
    )

    for sentence in candidates:
        if len(questions) >= num_questions:
            break

        targets = [
            w
            for w in _WORD.findall(sentence)
            if w in pool[:60] and w not in used_answers and len(w) >= 6
        ]
        if not targets:
            continue

        answer = targets[0]
        distractors = [
            w
            for w in pool
            if w != answer
            and w not in used_answers
            and abs(len(w) - len(answer)) <= 4
            and w.lower() != answer.lower()
        ][:12]

        if len(distractors) < 3:
            continue

        options = [answer, *rng.sample(distractors, 3)]
        rng.shuffle(options)

        blanked = re.sub(rf"\b{re.escape(answer)}\b", "______", sentence, count=1)
        used_answers.add(answer)

        questions.append(
            {
                "question": f'Fill the blank: "{blanked.strip()}"',
                "options": options,
                "answer_index": options.index(answer),
                "explanation": "Taken directly from the passage you just read.",
            }
        )

    return questions
