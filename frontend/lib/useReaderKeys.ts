"use client";

import { useEffect } from "react";
import { MAX_WPM, MIN_WPM, WPM_STEP } from "./constants";

interface ReaderActions {
  playing: boolean;
  wpm: number;
  toggle: () => void;
  pause: () => void;
  stepBack: () => void;
  stepForward: () => void;
  stepSentence: (direction: -1 | 1) => void;
  setWpm: (wpm: number) => void;
}

/**
 * The reader's keyboard shortcuts: Space plays or pauses, the arrows step a word
 * (a sentence with Shift), Up and Down change the speed within MIN_WPM..MAX_WPM,
 * and Escape pauses. Keys typed into a form field are left alone, and so is Space
 * on a focused button, which already presses that button.
 */
export function useReaderKeys({
  playing,
  wpm,
  toggle,
  pause,
  stepBack,
  stepForward,
  stepSentence,
  setWpm,
}: ReaderActions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (event.key) {
        case " ":
          if (tag === "BUTTON") return;
          event.preventDefault();
          toggle();
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) stepSentence(-1);
          else stepBack();
          break;
        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) stepSentence(1);
          else stepForward();
          break;
        case "ArrowUp":
          event.preventDefault();
          setWpm(Math.min(MAX_WPM, wpm + WPM_STEP));
          break;
        case "ArrowDown":
          event.preventDefault();
          setWpm(Math.max(MIN_WPM, wpm - WPM_STEP));
          break;
        case "Escape":
          if (playing) pause();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pause, playing, setWpm, stepBack, stepForward, stepSentence, toggle, wpm]);
}

/**
 * Pauses when the tab is hidden. Browsers throttle timers in hidden tabs, so a
 * reader who switched away would come back to a position that crept forward at
 * about a word a second, and to a logged stretch claiming that speed.
 */
export function usePauseWhenHidden(playing: boolean, pause: () => void) {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && playing) pause();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [playing, pause]);
}
