"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { CONTENT_CHUNK, DEFAULT_WPM } from "./constants";
import type { Doc, User, WordToken } from "./types";

export interface LoadedDocument {
  doc: Doc;
  tokens: WordToken[];
  /** Words in the whole document; `tokens` may still be catching up. */
  total: number;
  startIndex: number;
  startWpm: number;
}

/**
 * Loads a document for the reader and streams its words in.
 *
 * Words up to the reader's saved place are fetched before `loaded` is set, so
 * resuming deep in a book lands on the right word; the rest then streams in
 * behind the reader, CONTENT_CHUNK words at a time. Reading starts at the saved
 * speed, else the reader's preferred speed. Nothing loads until `user` is known.
 * `error` holds a message to show if the link or the document is bad.
 */
export function useDocumentWords(documentId: number, user: User | null) {
  const [loaded, setLoaded] = useState<LoadedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Loading depends on who is signed in, not on later changes to their account
  // (such as the remembered speed), so the speed is read through a ref.
  const userId = user?.id;
  const preferredWpm = useRef(user?.preferred_wpm);
  useEffect(() => {
    preferredWpm.current = user?.preferred_wpm;
  }, [user?.preferred_wpm]);

  useEffect(() => {
    if (userId === undefined) return;
    if (!Number.isInteger(documentId)) {
      queueMicrotask(() => setError("That isn't a valid document link."));
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const doc = await api.document(documentId);
        const tokens: WordToken[] = [];
        let total = Infinity;

        const resumeAt = doc.progress?.word_index ?? 0;
        while (tokens.length <= resumeAt && tokens.length < total) {
          const chunk = await api.content(documentId, tokens.length, CONTENT_CHUNK);
          if (cancelled) return;
          if (chunk.tokens.length === 0) break;
          tokens.push(...chunk.tokens);
          total = chunk.total;
        }
        if (total === Infinity) total = tokens.length;

        setLoaded({
          doc,
          tokens: [...tokens],
          total,
          startIndex: Math.min(resumeAt, Math.max(tokens.length - 1, 0)),
          startWpm: doc.progress?.wpm ?? preferredWpm.current ?? DEFAULT_WPM,
        });

        while (tokens.length < total && !cancelled) {
          const next = await api.content(documentId, tokens.length, CONTENT_CHUNK);
          if (cancelled || next.tokens.length === 0) break;
          tokens.push(...next.tokens);
          setLoaded((current) =>
            current ? { ...current, tokens: [...current.tokens, ...next.tokens] } : current,
          );
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, userId]);

  return { loaded, error };
}
