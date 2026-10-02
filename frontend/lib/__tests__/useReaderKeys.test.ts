/** The reader's keyboard shortcuts. */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_WPM, MIN_WPM, WPM_STEP } from "../constants";
import { useReaderKeys } from "../useReaderKeys";

function setup(overrides: { playing?: boolean; wpm?: number } = {}) {
  const actions = {
    playing: false,
    wpm: 300,
    toggle: vi.fn(),
    pause: vi.fn(),
    stepBack: vi.fn(),
    stepForward: vi.fn(),
    stepSentence: vi.fn(),
    setWpm: vi.fn(),
    ...overrides,
  };
  renderHook(() => useReaderKeys(actions));
  return actions;
}

function press(key: string, options: KeyboardEventInit = {}, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
}

describe("useReaderKeys", () => {
  it("plays and pauses on Space", () => {
    const actions = setup();
    press(" ");
    expect(actions.toggle).toHaveBeenCalledOnce();
  });

  it("steps words with the arrows and sentences with Shift", () => {
    const actions = setup();
    press("ArrowRight");
    press("ArrowLeft");
    press("ArrowRight", { shiftKey: true });
    press("ArrowLeft", { shiftKey: true });

    expect(actions.stepForward).toHaveBeenCalledOnce();
    expect(actions.stepBack).toHaveBeenCalledOnce();
    expect(actions.stepSentence.mock.calls).toEqual([[1], [-1]]);
  });

  it("changes speed with Up and Down, within the limits", () => {
    const fast = setup({ wpm: MAX_WPM });
    press("ArrowUp");
    expect(fast.setWpm).toHaveBeenCalledWith(MAX_WPM);

    const slow = setup({ wpm: 300 });
    press("ArrowDown");
    expect(slow.setWpm).toHaveBeenCalledWith(300 - WPM_STEP);

    const slowest = setup({ wpm: MIN_WPM });
    press("ArrowDown");
    expect(slowest.setWpm).toHaveBeenCalledWith(MIN_WPM);
  });

  it("pauses on Escape only while playing", () => {
    const paused = setup({ playing: false });
    press("Escape");
    expect(paused.pause).not.toHaveBeenCalled();

    const playing = setup({ playing: true });
    press("Escape");
    expect(playing.pause).toHaveBeenCalledOnce();
  });

  it("leaves keys typed into a form field alone", () => {
    const actions = setup();
    const input = document.createElement("input");
    document.body.append(input);

    press(" ", {}, input);
    press("ArrowRight", {}, input);

    expect(actions.toggle).not.toHaveBeenCalled();
    expect(actions.stepForward).not.toHaveBeenCalled();
    input.remove();
  });

  it("leaves Space on a focused button to the button", () => {
    const actions = setup();
    const button = document.createElement("button");
    document.body.append(button);

    press(" ", {}, button);

    expect(actions.toggle).not.toHaveBeenCalled();
    button.remove();
  });
});
