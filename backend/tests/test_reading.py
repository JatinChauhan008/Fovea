"""Unit tests for the reading algorithms: ORP, pacing, cleaning, adaptation."""

import pytest

from app.services.adaptive import Sample, recommend
from app.services.tokenizer import (
    find_boilerplate,
    get_delay_multiplier,
    get_orp_index,
    normalise,
    tokenize_pages,
)


@pytest.mark.parametrize(
    "word,expected",
    [
        ("a", 0),
        ("to", 1),
        ("word", 1),
        ("三", 0),
        ("reader", 2),
        ("attention", 2),
        ("presentation", 3),
        ("comprehension", 3),
        ("incomprehensible", 4),
        ("antidisestablishmentarianism", 4),
    ],
)
def test_orp_follows_the_length_table(word, expected):
    assert get_orp_index(word) == expected


def test_orp_never_points_past_the_word():
    for word in ["a", "to", "the", "four", "eleven"]:
        assert 0 <= get_orp_index(word) < len(word)


def test_sentence_ends_hold_longest():
    assert get_delay_multiplier("end.") == 2.0
    assert get_delay_multiplier("really?") == 2.0
    assert get_delay_multiplier("stop!") == 2.0


def test_clause_breaks_hold_briefly():
    assert get_delay_multiplier("however,") == 1.3
    assert get_delay_multiplier("following:") == 1.3


def test_long_words_hold_longer():
    assert get_delay_multiplier("presentation") == 1.5
    assert get_delay_multiplier("plain") == 1.0


def test_factors_compound_but_stay_capped():
    # Long word ending a sentence: 1.5 * 2.0 = 3.0, at the cap.
    assert get_delay_multiplier("comprehension.") == 3.0


def test_trailing_quotes_do_not_hide_the_punctuation():
    assert get_delay_multiplier('done."') == 2.0


def test_normalise_rejoins_hyphenated_line_breaks():
    assert "presentation" in normalise("presen-\ntation")


def test_normalise_expands_ligatures():
    assert normalise("eﬃcient") == "efficient"


def test_boilerplate_detection_finds_running_heads():
    pages = [f"Fovea Report\nUnique body text {n}\n" for n in range(6)]
    assert "Fovea Report" in find_boilerplate(pages)


def test_boilerplate_detection_skips_short_documents():
    assert find_boilerplate(["Header\nbody", "Header\nbody"]) == set()


def test_tokenize_drops_boilerplate_and_decorations():
    pages = [f"Running Head\n* {n}\nReal sentence number {n} here." for n in range(8)]
    words = [token.t for token in tokenize_pages(pages)]

    assert "Running" not in words
    assert "*" not in words
    assert "sentence" in words


def test_tokens_carry_page_numbers():
    tokens = tokenize_pages(["first page text", "second page text"])
    assert {token.p for token in tokens} == {1, 2}


# --- adaptive engine ----------------------------------------------------


def test_no_data_returns_the_current_speed_with_no_confidence():
    result = recommend([], current_wpm=300)
    assert result["confidence"] == "none"
    assert result["recommended_wpm"] == 300
    assert result["samples"] == 0


def test_strong_comprehension_pushes_speed_up():
    samples = [Sample(wpm=300, comprehension=0.95)] * 4
    result = recommend(samples, current_wpm=300)
    assert result["recommended_wpm"] > 300


def test_weak_comprehension_pulls_speed_down():
    samples = [Sample(wpm=500, comprehension=0.40)] * 4
    result = recommend(samples, current_wpm=500)
    assert result["recommended_wpm"] < 500


def test_comprehension_in_the_target_band_holds_roughly_steady():
    samples = [Sample(wpm=400, comprehension=0.84)] * 3
    result = recommend(samples, current_wpm=400)
    assert 375 <= result["recommended_wpm"] <= 425


def test_recommendations_respect_the_configured_ceiling():
    samples = [Sample(wpm=900, comprehension=1.0)] * 6
    result = recommend(samples, current_wpm=900, max_wpm=900)
    assert result["recommended_wpm"] == 900


def test_recommendations_respect_the_configured_floor():
    samples = [Sample(wpm=100, comprehension=0.1)] * 6
    result = recommend(samples, current_wpm=100, min_wpm=100)
    assert result["recommended_wpm"] == 100


def test_recommendations_land_on_clean_steps():
    samples = [Sample(wpm=337, comprehension=0.93)] * 3
    assert recommend(samples, current_wpm=337)["recommended_wpm"] % 25 == 0


def test_no_wild_jumps_from_a_single_good_score():
    samples = [Sample(wpm=200, comprehension=1.0)]
    result = recommend(samples, current_wpm=200)
    assert result["recommended_wpm"] - 200 <= 100


def test_confidence_grows_with_evidence():
    assert recommend([Sample(300, 0.9)], current_wpm=300)["confidence"] == "low"
    assert recommend([Sample(300, 0.9)] * 4, current_wpm=300)["confidence"] == "medium"
    assert recommend([Sample(300, 0.9)] * 8, current_wpm=300)["confidence"] == "high"


# --- local quiz generator -----------------------------------------------


def test_local_quiz_does_not_reuse_a_repeated_sentence():
    """Documents repeat themselves; asking twice about one sentence leaks answers."""
    from app.services.llm import _heuristic_quiz

    sentence = (
        "Comprehension holds up well through roughly four hundred words per minute "
        "for familiar material, then begins to decline sharply. "
    )
    filler = (
        "The optimal recognition point describes the letter a reader fixates when "
        "identifying an unfamiliar word. Punctuation signals boundaries between "
        "clauses, and readers benefit from additional time at those boundaries. "
        "Adaptive systems adjust presentation speed by measuring retention after "
        "each completed section of material. "
    )

    questions = _heuristic_quiz(sentence * 5 + filler, 4)

    stems = [q["question"] for q in questions]
    assert len(stems) == len(set(stems))

    # The repeated sentence must contribute at most one question.
    from_repeat = [s for s in stems if "holds up well" in s]
    assert len(from_repeat) <= 1


def test_local_quiz_answers_are_inside_the_options():
    from app.services.llm import _heuristic_quiz

    text = (
        "Rapid serial visual presentation displays one word at a time in a fixed "
        "position. The technique removes saccadic eye movement entirely. Researchers "
        "measured comprehension across several presentation speeds. Retention declined "
        "sharply for unfamiliar technical material at higher speeds. Highlighting the "
        "recognition letter reduces the horizontal adjustment the eye performs. "
    )
    for question in _heuristic_quiz(text, 3):
        assert len(question["options"]) == 4
        assert 0 <= question["answer_index"] < 4
        assert len(set(question["options"])) == 4
