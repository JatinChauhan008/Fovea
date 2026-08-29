"""Adaptive reading-speed engine.

Turns a user's history of (speed, comprehension) pairs into a recommended WPM.
The rule is deliberately explainable - every recommendation carries the reason
that produced it, because a number the reader doesn't trust won't be followed.
"""

from __future__ import annotations

from dataclasses import dataclass

# Comprehension we want to hold while pushing speed up.
TARGET_COMPREHENSION = 0.80
# Comprehension above which we push harder.
STRONG_COMPREHENSION = 0.90
# Below this, the reader is going too fast to retain anything.
WEAK_COMPREHENSION = 0.65

STEP = 25  # recommendations always land on a clean 25-WPM increment
BUCKET = 50  # speeds within 50 WPM of each other are treated as the same pace
RECENT_SESSIONS = 12


@dataclass
class Sample:
    wpm: int
    comprehension: float


def _round_to_step(value: float, minimum: int, maximum: int) -> int:
    stepped = int(round(value / STEP) * STEP)
    return max(minimum, min(maximum, stepped))


def recommend(
    samples: list[Sample],
    current_wpm: int,
    *,
    min_wpm: int = 100,
    max_wpm: int = 900,
    default_wpm: int = 250,
) -> dict:
    """Recommend a reading speed from scored sessions, newest last."""
    scored = [s for s in samples if s.comprehension is not None][-RECENT_SESSIONS:]

    if not scored:
        return {
            "recommended_wpm": _round_to_step(current_wpm or default_wpm, min_wpm, max_wpm),
            "current_wpm": current_wpm,
            "confidence": "none",
            "rationale": (
                "No comprehension data yet. Take a quiz after a reading session "
                "and Fovea will start tuning your speed."
            ),
            "samples": 0,
            "average_comprehension": None,
        }

    average = sum(s.comprehension for s in scored) / len(scored)

    # Group by pace so repeated runs at the same speed reinforce each other.
    buckets: dict[int, list[float]] = {}
    for sample in scored:
        key = int(round(sample.wpm / BUCKET) * BUCKET)
        buckets.setdefault(key, []).append(sample.comprehension)

    # The fastest pace at which comprehension still holds up.
    sustainable = [
        wpm
        for wpm, scores in buckets.items()
        if sum(scores) / len(scores) >= TARGET_COMPREHENSION
    ]

    latest = scored[-1]
    confidence = "high" if len(scored) >= 6 else "medium" if len(scored) >= 3 else "low"

    if latest.comprehension >= STRONG_COMPREHENSION:
        ceiling = max(sustainable) if sustainable else latest.wpm
        target = max(ceiling, latest.wpm) * 1.10
        rationale = (
            f"You scored {latest.comprehension:.0%} at {latest.wpm} WPM - comfortably above "
            f"the {TARGET_COMPREHENSION:.0%} target, so there is room to push."
        )
    elif latest.comprehension >= TARGET_COMPREHENSION:
        target = latest.wpm * 1.04
        rationale = (
            f"{latest.comprehension:.0%} at {latest.wpm} WPM is right in the productive band. "
            "Nudging up slightly."
        )
    elif latest.comprehension >= WEAK_COMPREHENSION:
        target = latest.wpm * 0.92
        rationale = (
            f"{latest.comprehension:.0%} at {latest.wpm} WPM is slipping below the "
            f"{TARGET_COMPREHENSION:.0%} target. Easing off a little."
        )
    else:
        fallback = max(sustainable) if sustainable else latest.wpm * 0.80
        target = min(latest.wpm * 0.80, fallback)
        rationale = (
            f"Comprehension dropped to {latest.comprehension:.0%} at {latest.wpm} WPM. "
            "Slowing down to a pace you were retaining."
        )

    recommended = _round_to_step(target, min_wpm, max_wpm)

    # Never recommend a jump so large it feels arbitrary.
    if current_wpm:
        limit = max(STEP * 4, int(current_wpm * 0.25))
        recommended = _round_to_step(
            max(current_wpm - limit, min(current_wpm + limit, recommended)),
            min_wpm,
            max_wpm,
        )

    return {
        "recommended_wpm": recommended,
        "current_wpm": current_wpm,
        "confidence": confidence,
        "rationale": rationale,
        "samples": len(scored),
        "average_comprehension": round(average, 3),
    }
