"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordToken } from "./types";

interface Options {
  tokens: WordToken[];
  initialIndex?: number;
  initialWpm?: number;
  /** Called once the last word is reached. */
  onFinish?: () => void;
}

export interface ReadingStretch {
  startIndex: number;
  endIndex: number;
  seconds: number;
}

const SENTENCE_END = /[.!?]["')\]]?$/;

/**
 * Drives the one-word-at-a-time reading loop.
 *
 * Each word schedules the next: the hold time is the base delay (60s / WPM)
 * scaled by that word's multiplier, so sentence ends and long words get the
 * extra beat a reader needs without changing the overall pace.
 */
export function useRsvp({
  tokens,
  initialIndex = 0,
  initialWpm = 300,
  onFinish,
}: Options) {
  const [index, setIndex] = useState(initialIndex);
  const [wpm, setWpm] = useState(initialWpm);
  const [playing, setPlaying] = useState(false);

  // Where the current stretch of reading began, and whether one is underway.
  const [stretchStart, setStretchStart] = useState(initialIndex);
  const [started, setStarted] = useState(false);

  // Wall-clock accounting, excluding paused time. Timing values are only ever
  // touched from callbacks and effects, never read during render.
  const runStartedAt = useRef<number | null>(null);
  const accumulated = useRef(0);

  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  const total = tokens.length;
  const finished = total > 0 && index >= total - 1;

  const pause = useCallback(() => {
    if (runStartedAt.current !== null) {
      accumulated.current += (performance.now() - runStartedAt.current) / 1000;
      runStartedAt.current = null;
    }
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (total === 0) return;
    runStartedAt.current = performance.now();
    if (!started) {
      setStretchStart(index);
      setStarted(true);
    }
    setPlaying(true);
  }, [index, started, total]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const seek = useCallback(
    (next: number) => {
      if (total === 0) return;
      setIndex(Math.max(0, Math.min(next, total - 1)));
    },
    [total],
  );

  const stepForward = useCallback(() => seek(index + 1), [index, seek]);
  const stepBack = useCallback(() => seek(index - 1), [index, seek]);

  /** Jump to the start of the previous or next sentence. */
  const stepSentence = useCallback(
    (direction: -1 | 1) => {
      if (total === 0) return;

      if (direction === -1) {
        // Skip the boundary we are sitting on, then walk back to the one before it.
        for (let i = index - 2; i >= 0; i -= 1) {
          if (SENTENCE_END.test(tokens[i].t)) return seek(i + 1);
        }
        return seek(0);
      }

      for (let i = index; i < total; i += 1) {
        if (SENTENCE_END.test(tokens[i].t)) return seek(Math.min(i + 1, total - 1));
      }
      return seek(total - 1);
    },
    [index, seek, tokens, total],
  );

  const jumpToPage = useCallback(
    (page: number) => {
      const target = tokens.findIndex((token) => token.p >= page);
      if (target >= 0) seek(target);
    },
    [seek, tokens],
  );

  /** Hand back the stretch just read, and start a fresh one. */
  const consumeStretch = useCallback((): ReadingStretch | null => {
    let seconds = accumulated.current;
    if (runStartedAt.current !== null) {
      seconds += (performance.now() - runStartedAt.current) / 1000;
      runStartedAt.current = performance.now();
    }

    const stretch: ReadingStretch = { startIndex: stretchStart, endIndex: index, seconds };

    accumulated.current = 0;
    setStretchStart(index);

    return stretch.endIndex > stretch.startIndex ? stretch : null;
  }, [index, stretchStart]);

  // The loop itself: one timer per word, rescheduled as the index advances.
  useEffect(() => {
    if (!playing || total === 0 || index >= total - 1) return;

    const delay = (60_000 / wpm) * (tokens[index]?.m ?? 1);

    const timer = window.setTimeout(() => {
      const next = index + 1;
      setIndex(next);

      // Landing on the last word ends the run; the timeout callback is the
      // right place to do it, so no state cascade happens during render.
      if (next >= total - 1) {
        if (runStartedAt.current !== null) {
          accumulated.current += (performance.now() - runStartedAt.current) / 1000;
          runStartedAt.current = null;
        }
        setPlaying(false);
        finishRef.current?.();
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [playing, index, wpm, tokens, total]);

  const current = tokens[index];
  const percent = total > 1 ? (index / (total - 1)) * 100 : 0;

  const stats = useMemo(
    () => ({
      wordsThisStretch: Math.max(index - stretchStart, 0),
      stretchStartIndex: stretchStart,
      remaining: Math.max(total - index, 0),
      // Estimated minutes left at the current pace.
      minutesLeft: total ? (total - index) / wpm : 0,
    }),
    [index, stretchStart, total, wpm],
  );

  return {
    index,
    wpm,
    playing,
    finished,
    total,
    token: current,
    page: current?.p ?? 1,
    percent,
    stats,
    setWpm,
    play,
    pause,
    toggle,
    seek,
    stepForward,
    stepBack,
    stepSentence,
    jumpToPage,
    consumeStretch,
  };
}
