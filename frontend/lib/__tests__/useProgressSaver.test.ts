/**
 * Keeping the reader's place saved: periodic saves, saving when the tab is
 * hidden, and telling the reader when saves are failing.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressSaver } from "../useProgressSaver";

const saveProgress = vi.fn();
const recordSession = vi.fn();
vi.mock("../api", () => ({
  api: {
    saveProgress: (...args: unknown[]) => saveProgress(...args),
    recordSession: (...args: unknown[]) => recordSession(...args),
  },
}));

const at = { documentId: 7, index: 120, page: 3, wpm: 300 };

function hideTab() {
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
}

describe("useProgressSaver", () => {
  // Reset before each test, not after: the previous test's unmount also saves.
  beforeEach(() => {
    saveProgress.mockReset().mockResolvedValue({});
    recordSession.mockReset().mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it("saves the current place every few seconds while playing", () => {
    vi.useFakeTimers();
    renderHook(() => useProgressSaver({ ...at, playing: true }));

    act(() => vi.advanceTimersByTime(5000));

    expect(saveProgress).toHaveBeenCalledWith(7, 120, 3, 300);
  });

  it("does not save on a timer while paused", () => {
    vi.useFakeTimers();
    renderHook(() => useProgressSaver({ ...at, playing: false }));

    act(() => vi.advanceTimersByTime(20000));

    expect(saveProgress).not.toHaveBeenCalled();
  });

  it("saves when the tab is hidden, even while paused", () => {
    renderHook(() => useProgressSaver({ ...at, playing: false }));

    act(() => hideTab());

    expect(saveProgress).toHaveBeenCalledWith(7, 120, 3, 300);
  });

  it("logs a finished stretch of reading and saves the place with it", () => {
    const { result } = renderHook(() => useProgressSaver({ ...at, playing: false }));

    act(() => result.current.logStretch({ startIndex: 100, endIndex: 120, wpm: 300, seconds: 4 }));

    expect(recordSession).toHaveBeenCalledWith({
      document_id: 7,
      start_index: 100,
      end_index: 120,
      wpm: 300,
      duration_seconds: 4,
    });
    expect(saveProgress).toHaveBeenCalledOnce();
  });

  it("reports failing saves until one succeeds", async () => {
    saveProgress.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useProgressSaver({ ...at, playing: false }));

    await act(async () => result.current.save());
    expect(result.current.saveFailed).toBe(true);

    await act(async () => result.current.save());
    expect(result.current.saveFailed).toBe(false);
  });
});
