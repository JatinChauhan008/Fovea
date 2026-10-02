/**
 * The reader's wiring: finished stretches reach the saver, finishing a book saves
 * the place, and a hidden tab pauses reading.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, WordToken } from "../types";
import { useReader } from "../useReader";
import { usePauseWhenHidden } from "../useReaderKeys";

const saveProgress = vi.fn();
const recordSession = vi.fn();
vi.mock("../api", () => ({
  api: {
    saveProgress: (...args: unknown[]) => saveProgress(...args),
    recordSession: (...args: unknown[]) => recordSession(...args),
  },
}));

const words: WordToken[] = ["a", "b", "c"].map((t) => ({ t, o: 0, m: 1, p: 1 }));
const doc = { id: 4, page_count: 1, word_count: 3 } as Doc;
const BASE_MS = 60_000 / 300;

describe("useReader", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
    saveProgress.mockReset().mockResolvedValue({});
    recordSession.mockReset().mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it("logs a stretch when reading pauses", () => {
    const { result } = renderHook(() =>
      useReader({ doc, tokens: words, total: 3, startIndex: 0, startWpm: 300 }),
    );

    act(() => result.current.play());
    act(() => vi.advanceTimersByTime(BASE_MS));
    act(() => result.current.pause());

    expect(recordSession).toHaveBeenCalledWith(
      expect.objectContaining({ document_id: 4, start_index: 0, end_index: 1, wpm: 300 }),
    );
  });

  it("saves the place when the end of the document is reached", () => {
    const { result } = renderHook(() =>
      useReader({ doc, tokens: words, total: 3, startIndex: 0, startWpm: 300 }),
    );

    act(() => result.current.play());
    // One word at a time: each word's timer is scheduled after the previous one renders.
    act(() => vi.advanceTimersByTime(BASE_MS));
    act(() => vi.advanceTimersByTime(BASE_MS));

    expect(result.current.finished).toBe(true);
    expect(recordSession).toHaveBeenCalledOnce();
    expect(saveProgress).toHaveBeenCalled();
  });
});

describe("usePauseWhenHidden", () => {
  function hideTab() {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  }

  it("pauses when the tab is hidden while playing", () => {
    const pause = vi.fn();
    renderHook(() => usePauseWhenHidden(true, pause));

    act(() => hideTab());

    expect(pause).toHaveBeenCalledOnce();
  });

  it("does nothing when already paused", () => {
    const pause = vi.fn();
    renderHook(() => usePauseWhenHidden(false, pause));

    act(() => hideTab());

    expect(pause).not.toHaveBeenCalled();
  });
});
