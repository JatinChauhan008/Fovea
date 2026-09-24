"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordToken } from "./types";

interface Options {
  tokens: WordToken[];
  /** Words in the whole document. `tokens` may still be streaming in behind it. */
  totalWords: number;
  initialIndex?: number;
  initialWpm?: number;
  /** Called whenever a continuous run of reading ends: pause, jump, speed change, finish, or unmount. */
  onStretchEnd?: (stretch: ReadingStretch) => void;
  /** Called once the last word of the document is reached. */
  onFinish?: () => void;
}

export interface ReadingStretch {
  startIndex: number;
  endIndex: number;
  wpm: number;
  seconds: number;
}

const SENTENCE_END = /[.!?]["')\]]?$/;

/**
 * Drives the one-word-at-a-time reading loop.
 *
 * Each word schedules the next: the hold time is the base delay (60s / WPM)
 * scaled by that word's multiplier, so sentence ends and long words get the
 * extra beat a reader needs without changing the overall pace.
 *
 * A "stretch" is words read continuously at one speed. Anything that breaks
 * that - pausing, jumping, changing speed - closes the stretch and reports it,
 * so logged sessions never include skipped words or mixed speeds.
 */
export function useRsvp({
  tokens,
  totalWords,
  initialIndex = 0,
  initialWpm = 300,
  onStretchEnd,
  onFinish,
}: Options) {
  const [index, setIndex] = useState(initialIndex);
  const [wpm, setWpmState] = useState(initialWpm);
  const [playing, setPlaying] = useState(false);

  // Stretch bookkeeping. Only touched from callbacks and effects, never read during render.
  const stretch = useRef<{ start: number; wpm: number; since: number } | null>(null);
  const indexRef = useRef(initialIndex);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const stretchEndRef = useRef(onStretchEnd);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    stretchEndRef.current = onStretchEnd;
    finishRef.current = onFinish;
  }, [onStretchEnd, onFinish]);

  const loaded = tokens.length;
  const fullyLoaded = loaded >= totalWords;
  const finished = fullyLoaded && loaded > 0 && index >= loaded - 1;

  const openStretch = useCallback((at: number, atWpm: number) => {
    stretch.current = { start: at, wpm: atWpm, since: performance.now() };
  }, []);

  const closeStretch = useCallback((end: number) => {
    const open = stretch.current;
    stretch.current = null;
    if (!open) return;

    const seconds = (performance.now() - open.since) / 1000;
    if (end > open.start && seconds > 0) {
      stretchEndRef.current?.({ startIndex: open.start, endIndex: end, wpm: open.wpm, seconds });
    }
  }, []);

  // Leaving the reader mid-run still counts the words read.
  useEffect(() => () => closeStretch(indexRef.current), [closeStretch]);

  const pause = useCallback(() => {
    closeStretch(index);
    setPlaying(false);
  }, [closeStretch, index]);

  const play = useCallback(() => {
    if (loaded === 0) return;
    // Pressing play on the last word starts the document over.
    const from = finished ? 0 : index;
    if (from !== index) setIndex(from);
    openStretch(from, wpm);
    setPlaying(true);
  }, [finished, index, loaded, openStretch, wpm]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const seek = useCallback(
    (next: number) => {
      if (loaded === 0) return;
      const target = Math.max(0, Math.min(next, loaded - 1));
      if (playing) {
        closeStretch(index);
        openStretch(target, wpm);
      }
      setIndex(target);
    },
    [closeStretch, index, loaded, openStretch, playing, wpm],
  );

  const setWpm = useCallback(
    (next: number) => {
      if (next === wpm) return;
      if (playing) {
        closeStretch(index);
        openStretch(index, next);
      }
      setWpmState(next);
    },
    [closeStretch, index, openStretch, playing, wpm],
  );

  const stepForward = useCallback(() => seek(index + 1), [index, seek]);
  const stepBack = useCallback(() => seek(index - 1), [index, seek]);

  /** Jump to the start of the previous or next sentence. */
  const stepSentence = useCallback(
    (direction: -1 | 1) => {
      if (loaded === 0) return;

      if (direction === -1) {
        // Skip the boundary we are sitting on, then walk back to the one before it.
        for (let i = index - 2; i >= 0; i -= 1) {
          if (SENTENCE_END.test(tokens[i].t)) return seek(i + 1);
        }
        return seek(0);
      }

      for (let i = index; i < loaded; i += 1) {
        if (SENTENCE_END.test(tokens[i].t)) return seek(Math.min(i + 1, loaded - 1));
      }
      return seek(loaded - 1);
    },
    [index, seek, tokens, loaded],
  );

  const jumpToPage = useCallback(
    (page: number) => {
      const target = tokens.findIndex((token) => token.p >= page);
      if (target >= 0) seek(target);
    },
    [seek, tokens],
  );

  // The loop itself: one timer per word, rescheduled as the index advances.
  // If reading outruns the stream, it simply waits here until more words arrive.
  useEffect(() => {
    if (!playing || index >= loaded - 1) return;

    const delay = (60_000 / wpm) * (tokens[index]?.m ?? 1);

    const timer = window.setTimeout(() => {
      const next = index + 1;
      setIndex(next);

      if (fullyLoaded && next >= loaded - 1) {
        closeStretch(next);
        setPlaying(false);
        finishRef.current?.();
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [closeStretch, fullyLoaded, index, loaded, playing, tokens, wpm]);

  const current = tokens[index];

  const progress = useMemo(
    () => ({
      percent: totalWords > 1 ? (Math.min(index, totalWords - 1) / (totalWords - 1)) * 100 : 0,
      minutesLeft: totalWords ? Math.max(totalWords - index, 0) / wpm : 0,
    }),
    [index, totalWords, wpm],
  );

  return {
    index,
    wpm,
    playing,
    finished,
    token: current,
    page: current?.p ?? 1,
    percent: progress.percent,
    minutesLeft: progress.minutesLeft,
    setWpm,
    play,
    pause,
    toggle,
    seek,
    stepForward,
    stepBack,
    stepSentence,
    jumpToPage,
  };
}
