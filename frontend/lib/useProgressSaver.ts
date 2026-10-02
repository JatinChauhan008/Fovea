"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { PROGRESS_SAVE_INTERVAL_MS } from "./constants";
import type { ReadingStretch } from "./useRsvp";

interface Options {
  documentId: number;
  index: number;
  page: number;
  wpm: number;
  playing: boolean;
}

/**
 * Keeps the reader's place saved on the server and logs each stretch of reading.
 *
 * The place is saved every few seconds while playing, whenever a stretch ends,
 * when the tab is hidden (which also happens when it is closed), and when the
 * reader is left. `saveFailed` turns true when a save or log fails and back to
 * false on the next one that succeeds, so the reader can be told.
 */
export function useProgressSaver({ documentId, index, page, wpm, playing }: Options) {
  const [saveFailed, setSaveFailed] = useState(false);

  // Read by the timers and listeners below, so they never need re-creating per word.
  const position = useRef({ index, page, wpm });
  useEffect(() => {
    position.current = { index, page, wpm };
  }, [index, page, wpm]);

  const track = useCallback((request: Promise<unknown>) => {
    return request.then(
      () => setSaveFailed(false),
      () => setSaveFailed(true),
    );
  }, []);

  const save = useCallback(() => {
    const { index: at, page: onPage, wpm: speed } = position.current;
    return track(api.saveProgress(documentId, at, onPage, speed));
  }, [documentId, track]);

  const logStretch = useCallback(
    (stretch: ReadingStretch) => {
      track(
        api.recordSession({
          document_id: documentId,
          start_index: stretch.startIndex,
          end_index: stretch.endIndex,
          wpm: stretch.wpm,
          duration_seconds: stretch.seconds,
        }),
      );
      save();
    },
    [documentId, save, track],
  );

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(save, PROGRESS_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, save]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) save();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [save]);

  useEffect(() => () => void save(), [save]);

  return { save, logStretch, saveFailed };
}
