/**
 * RSVP timing loop tests (Issue #6).
 *
 * Fake timers let us assert the exact scheduling contract without running a
 * real browser, without the tab-throttle problem, and at full speed.
 *
 * Contracts verified:
 *   1. A plain word at 300 WPM advances after exactly 200 ms
 *   2. A sentence-ending word holds twice as long (x2 multiplier)
 *   3. A 12+ letter word holds 1.5x as long
 *   4. Combined punctuation + long word compounds, capped at x3
 *   5. Changing WPM mid-run uses the new speed for the next word
 *   6. Each run of reading is reported separately, excluding paused time
 *   7. Jumping while paused never counts the skipped words as read
 *   8. Reaching the end of a partly-loaded document waits instead of finishing
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ReadingStretch, useRsvp } from "../useRsvp";
import type { WordToken } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal WordToken. */
function tok(text: string, multiplier = 1.0, page = 1): WordToken {
  return { t: text, o: 0, m: multiplier, p: page };
}

/** 300 WPM base delay in ms. */
const BASE_MS = 60_000 / 300; // 200

describe("useRsvp scheduling", () => {
  beforeEach(() => {
    // Fake both setTimeout AND performance.now so consumeStretch calculations
    // are deterministic. Vitest advances performance.now in sync with timers
    // when "performance" is included in the toFake list.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- 1. Plain word at 300 WPM -------------------------------------------
  it("advances after (60 000 / WPM) ms for a plain word", () => {
    const tokens = [tok("hello"), tok("world")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300 }),
    );

    act(() => result.current.play());
    expect(result.current.index).toBe(0);

    // Advance by just under the delay — should still be on word 0.
    act(() => vi.advanceTimersByTime(BASE_MS - 1));
    expect(result.current.index).toBe(0);

    // Advance past the delay — should now be on word 1.
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.index).toBe(1);
  });

  // --- 2. Sentence-ending word holds 2x -----------------------------------
  it("holds a sentence-ending word for 2x the base delay", () => {
    // The tokenizer sets m=2.0 for words ending in . ! ?
    const tokens = [tok("Done.", 2.0), tok("Next")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300 }),
    );

    act(() => result.current.play());

    // Should not advance at 1x delay.
    act(() => vi.advanceTimersByTime(BASE_MS + 10));
    expect(result.current.index).toBe(0);

    // Should advance at 2x delay.
    act(() => vi.advanceTimersByTime(BASE_MS));
    expect(result.current.index).toBe(1);
  });

  // --- 3. Long word holds 1.5x -------------------------------------------
  it("holds a 12+ letter word for 1.5x the base delay", () => {
    // The tokenizer sets m=1.5 for words of 12+ letters.
    const tokens = [tok("comprehension", 1.5), tok("short")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300 }),
    );

    act(() => result.current.play());

    // Should not advance at 1x delay.
    act(() => vi.advanceTimersByTime(BASE_MS + 10));
    expect(result.current.index).toBe(0);

    // Should advance at 1.5x delay.
    act(() => vi.advanceTimersByTime(BASE_MS / 2));
    expect(result.current.index).toBe(1);
  });

  // --- 4. Combined multiplier capped at x3 --------------------------------
  it("compounds multipliers up to a maximum of x3", () => {
    // sentence end (x2) + 12-letter word (x1.5) => x3 (capped; tokenizer pre-computes this)
    const tokens = [tok("comprehension.", 3.0), tok("next")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300 }),
    );

    act(() => result.current.play());

    // Should not advance before 3x delay.
    act(() => vi.advanceTimersByTime(BASE_MS * 3 - 1));
    expect(result.current.index).toBe(0);

    // Should advance at exactly 3x delay.
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.index).toBe(1);
  });

  // --- 5. Changing WPM takes effect on the very next word -----------------
  it("uses the updated WPM for the word after setWpm is called", () => {
    const tokens = [tok("one"), tok("two"), tok("three")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300 }),
    );

    act(() => result.current.play());

    // Advance past word 0 (200 ms at 300 WPM).
    act(() => vi.advanceTimersByTime(BASE_MS + 1));
    expect(result.current.index).toBe(1);

    // Switch to 600 WPM — next word should hold for 100 ms.
    act(() => result.current.setWpm(600));

    const newBase = 60_000 / 600; // 100 ms

    // Should not advance before 100 ms.
    act(() => vi.advanceTimersByTime(newBase - 1));
    expect(result.current.index).toBe(1);

    // Should advance after 100 ms.
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.index).toBe(2);
  });

  // --- 6. Stretches exclude paused time -----------------------------------
  it("reports each run of reading separately, excluding paused time", () => {
    const tokens = [tok("a"), tok("b"), tok("c"), tok("d")];
    const stretches: ReadingStretch[] = [];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300, onStretchEnd: (s) => stretches.push(s) }),
    );

    // Play for 300 ms (one word advance at 200 ms), then pause.
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.pause());

    // Idle for 1 000 ms - must not count toward reading time.
    act(() => vi.advanceTimersByTime(1_000));

    // Resume and play for another 200 ms.
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(200));
    act(() => result.current.pause());

    expect(stretches).toHaveLength(2);
    expect(stretches[0]).toMatchObject({ startIndex: 0, endIndex: 1, wpm: 300 });
    expect(stretches[0].seconds).toBeCloseTo(0.3, 1);
    expect(stretches[1]).toMatchObject({ startIndex: 1, endIndex: 2, wpm: 300 });
    expect(stretches[1].seconds).toBeCloseTo(0.2, 1);
  });

  // --- 7. Jumps are never logged as reading -------------------------------
  it("does not count words skipped by a jump while paused", () => {
    const tokens = Array.from({ length: 1000 }, (_, i) => tok(`w${i}`));
    const stretches: ReadingStretch[] = [];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300, onStretchEnd: (s) => stretches.push(s) }),
    );

    act(() => result.current.play());
    // One word per step: each word's timer is scheduled after the previous render.
    act(() => vi.advanceTimersByTime(BASE_MS + 1));
    act(() => vi.advanceTimersByTime(BASE_MS + 1));
    act(() => result.current.pause());

    act(() => result.current.seek(900));
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(BASE_MS + 1));
    act(() => result.current.pause());

    expect(stretches.map(({ startIndex, endIndex }) => [startIndex, endIndex])).toEqual([
      [0, 2],
      [900, 901],
    ]);
  });

  // --- 8. A streaming document is not "finished" at the end of the buffer --
  it("waits at the end of loaded words when more of the document is coming", () => {
    const onFinish = vi.fn();
    const tokens = [tok("a"), tok("b")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, totalWords: 50, initialWpm: 300, onFinish }),
    );

    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(BASE_MS * 5));

    expect(result.current.index).toBe(1);
    expect(result.current.finished).toBe(false);
    expect(result.current.playing).toBe(true);
    expect(onFinish).not.toHaveBeenCalled();
  });

  // --- 9. More words arriving doesn't restart the word on screen ------------
  it("keeps the current word's timing when another chunk of words arrives", () => {
    const first = [tok("a"), tok("b"), tok("c")];
    const { result, rerender } = renderHook(
      ({ tokens }) => useRsvp({ tokens, totalWords: 6, initialWpm: 300 }),
      { initialProps: { tokens: first } },
    );

    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(BASE_MS - 50));
    rerender({ tokens: [...first, tok("d"), tok("e"), tok("f")] });
    act(() => vi.advanceTimersByTime(50));

    expect(result.current.index).toBe(1);
  });

  // --- 10. Jumping somewhere that hasn't loaded yet --------------------------
  it("waits for a page that hasn't loaded yet, then jumps to it", () => {
    const first = [tok("a", 1, 1), tok("b", 1, 1)];
    const { result, rerender } = renderHook(
      ({ tokens }) => useRsvp({ tokens, totalWords: 4, initialWpm: 300 }),
      { initialProps: { tokens: first } },
    );

    act(() => result.current.jumpToPage(2));
    expect(result.current.index).toBe(0);
    expect(result.current.waitingForPage).toBe(2);

    rerender({ tokens: [...first, tok("c", 1, 2), tok("d", 1, 2)] });

    expect(result.current.index).toBe(2);
    expect(result.current.waitingForPage).toBeNull();
  });

  it("waits for a position past the loaded words, then lands on it", () => {
    const first = [tok("a"), tok("b")];
    const { result, rerender } = renderHook(
      ({ tokens }) => useRsvp({ tokens, totalWords: 4, initialWpm: 300 }),
      { initialProps: { tokens: first } },
    );

    act(() => result.current.seek(3));
    expect(result.current.index).toBe(0);

    rerender({ tokens: [...first, tok("c"), tok("d")] });

    expect(result.current.index).toBe(3);
  });

  it("drops a waiting jump when reading starts again, so skipped words aren't logged", () => {
    const stretches: ReadingStretch[] = [];
    const first = [tok("a", 1, 1), tok("b", 1, 1), tok("c", 1, 1)];
    const { result, rerender } = renderHook(
      ({ tokens }) =>
        useRsvp({ tokens, totalWords: 6, initialWpm: 300, onStretchEnd: (s) => stretches.push(s) }),
      { initialProps: { tokens: first } },
    );

    act(() => result.current.jumpToPage(2));
    act(() => result.current.play());
    rerender({ tokens: [...first, tok("d", 1, 2), tok("e", 1, 2), tok("f", 1, 2)] });
    act(() => vi.advanceTimersByTime(BASE_MS));
    act(() => result.current.pause());

    expect(result.current.waitingForPage).toBeNull();
    expect(stretches).toEqual([expect.objectContaining({ startIndex: 0, endIndex: 1 })]);
  });

  it("a single step at the end of the loaded words keeps playing instead of waiting", () => {
    const { result } = renderHook(() =>
      useRsvp({ tokens: [tok("a"), tok("b")], totalWords: 10, initialWpm: 300 }),
    );

    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(BASE_MS));
    act(() => result.current.stepForward());

    expect(result.current.playing).toBe(true);
    expect(result.current.index).toBe(1);
  });

  it("stops waiting for a page that turns out not to exist", () => {
    const first = [tok("a", 1, 1)];
    const { result, rerender } = renderHook(
      ({ tokens }) => useRsvp({ tokens, totalWords: 2, initialWpm: 300 }),
      { initialProps: { tokens: first } },
    );

    act(() => result.current.jumpToPage(9));
    rerender({ tokens: [...first, tok("b", 1, 1)] });

    expect(result.current.waitingForPage).toBeNull();
    expect(result.current.index).toBe(0);
  });
});
