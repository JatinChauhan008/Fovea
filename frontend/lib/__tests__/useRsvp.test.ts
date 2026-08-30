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
 *   6. consumeStretch reports elapsed wall time excluding paused intervals
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRsvp } from "../useRsvp";
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

  // --- 6. consumeStretch excludes paused time -----------------------------
  it("consumeStretch reports elapsed seconds excluding paused intervals", () => {
    const tokens = [tok("a"), tok("b"), tok("c"), tok("d")];
    const { result } = renderHook(() =>
      useRsvp({ tokens, initialWpm: 300 }),
    );

    // Play for 300 ms, then pause.
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.pause());

    // Idle for 1 000 ms — must not count toward active reading time.
    act(() => vi.advanceTimersByTime(1_000));

    // Resume and play for another 200 ms.
    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(200));

    let stretch: ReturnType<typeof result.current.consumeStretch>;
    act(() => {
      stretch = result.current.consumeStretch();
    });

    // Total active time = 500 ms = 0.5 s. Allow +/-50 ms for timer rounding.
    expect(stretch).not.toBeNull();
    expect(stretch!.seconds).toBeGreaterThan(0.4);
    expect(stretch!.seconds).toBeLessThan(0.6);
  });
});
