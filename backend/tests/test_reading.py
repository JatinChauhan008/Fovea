"""Unit tests for the reading algorithms: ORP, pacing, cleaning."""

import pytest

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
