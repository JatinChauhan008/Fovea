"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LoadedDocument } from "./useDocumentWords";
import { useProgressSaver } from "./useProgressSaver";
import { type ReadingStretch, useRsvp } from "./useRsvp";

/**
 * Everything the reader page needs for one open document: the reading loop
 * (useRsvp) joined to the saver that keeps the place saved and logs each stretch
 * of reading (useProgressSaver). Returns the loop's state and controls, plus
 * `saveFailed` while saves are failing.
 *
 * The loop reports finished stretches to the saver, but the saver is built from
 * the loop's position, so the loop's callbacks reach the saver through a ref.
 */
export function useReader({ doc, tokens, total, startIndex, startWpm }: LoadedDocument) {
  const saver = useRef<ReturnType<typeof useProgressSaver> | null>(null);
  const onStretchEnd = useCallback((stretch: ReadingStretch) => {
    saver.current?.logStretch(stretch);
  }, []);
  const onFinish = useCallback(() => {
    saver.current?.save();
  }, []);

  const reading = useRsvp({
    tokens,
    totalWords: total,
    initialIndex: startIndex,
    initialWpm: startWpm,
    onStretchEnd,
    onFinish,
  });

  const progressSaver = useProgressSaver({
    documentId: doc.id,
    index: reading.index,
    page: reading.page,
    wpm: reading.wpm,
    playing: reading.playing,
  });
  useEffect(() => {
    saver.current = progressSaver;
  }, [progressSaver]);

  return { ...reading, saveFailed: progressSaver.saveFailed };
}
