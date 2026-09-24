"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReaderControls } from "@/components/ReaderControls";
import { RsvpDisplay } from "@/components/RsvpDisplay";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import {
  CONTENT_CHUNK,
  DEFAULT_WPM,
  PROGRESS_SAVE_INTERVAL_MS,
} from "@/lib/constants";
import type { Doc, WordToken } from "@/lib/types";
import { type ReadingStretch, useRsvp } from "@/lib/useRsvp";

interface Loaded {
  doc: Doc;
  tokens: WordToken[];
  total: number;
  startIndex: number;
  startWpm: number;
}

const MIN_WPM = 100;
const MAX_WPM = 900;

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const documentId = Number(params.id);
  const { user, loading } = useRequireAuth();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
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

        // Load everything up to the saved position before showing the reader, so
        // resuming deep into a long document lands on the right word.
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
          startWpm: doc.progress?.wpm ?? user.preferred_wpm ?? DEFAULT_WPM,
        });

        // The rest streams in behind the reader, so reading starts immediately.
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
  }, [documentId, user]);

  if (error) {
    return (
      <div className="pt-24 text-center">
        <p className="text-orp">{error}</p>
        <Link href="/" className="mt-4 inline-block rounded-sm text-muted underline decoration-1 underline-offset-4 hover:text-ink">
          Back to the library
        </Link>
      </div>
    );
  }

  if (loading || !user || !loaded) {
    return <p className="pt-24 text-center text-sm text-faint">Opening document…</p>;
  }

  return <Reader key={loaded.doc.id} {...loaded} />;
}

function Reader({ doc, tokens, total, startIndex, startWpm }: Loaded) {
  // Keep the latest position available to the progress saver without
  // re-creating the interval on every word.
  const positionRef = useRef({ index: startIndex, page: 1, wpm: startWpm });

  const saveProgress = useCallback(() => {
    const { index, page, wpm } = positionRef.current;
    api.saveProgress(doc.id, index, page, wpm).catch(() => {});
  }, [doc.id]);

  const logStretch = useCallback(
    (stretch: ReadingStretch) => {
      api
        .recordSession({
          document_id: doc.id,
          start_index: stretch.startIndex,
          end_index: stretch.endIndex,
          wpm: stretch.wpm,
          duration_seconds: stretch.seconds,
        })
        .catch(() => {});
      saveProgress();
    },
    [doc.id, saveProgress],
  );

  const {
    index,
    wpm,
    playing,
    finished,
    page,
    percent,
    minutesLeft,
    setWpm,
    toggle,
    pause,
    seek,
    stepBack,
    stepForward,
    stepSentence,
    jumpToPage,
  } = useRsvp({
    tokens,
    totalWords: total,
    initialIndex: startIndex,
    initialWpm: startWpm,
    onStretchEnd: logStretch,
    onFinish: saveProgress,
  });

  useEffect(() => {
    positionRef.current = { index, page, wpm };
  }, [index, page, wpm]);

  // Periodic autosave while reading, plus a final save on the way out.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(saveProgress, PROGRESS_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, saveProgress]);

  useEffect(() => saveProgress, [saveProgress]);

  // Browsers throttle timers in hidden tabs, so a reader who switches away would
  // come back to a position that crept forward at about one word per second -
  // and to a logged session claiming they read at that speed. Stop cleanly instead.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && playing) pause();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [playing, pause]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (event.key) {
        case " ":
          // A focused button already activates on space. Handling it here too
          // would toggle twice and leave the reader exactly where it started.
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
          setWpm(Math.min(MAX_WPM, wpm + 25));
          break;
        case "ArrowDown":
          event.preventDefault();
          setWpm(Math.max(MIN_WPM, wpm - 25));
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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col">
      <header className="flex items-baseline gap-4 pt-6">
        <Link href="/" className="shrink-0 rounded-sm text-sm text-muted hover:text-ink">
          ← Library
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center font-serif text-muted" title={doc.title}>
          {doc.title}
        </h1>
        <span className="shrink-0 text-sm tabular-nums text-faint">{Math.floor(percent)}%</span>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        <RsvpDisplay tokens={tokens} index={index} playing={playing} />

        <div className="mt-12">
          <ReaderControls
            playing={playing}
            wpm={wpm}
            minWpm={MIN_WPM}
            maxWpm={MAX_WPM}
            index={index}
            total={total}
            loadedCount={tokens.length}
            page={page}
            pageCount={doc.page_count}
            minutesLeft={minutesLeft}
            onToggle={toggle}
            onStep={(direction) => (direction === -1 ? stepBack() : stepForward())}
            onSentence={stepSentence}
            onSeek={seek}
            onWpm={setWpm}
            onJumpToPage={jumpToPage}
          />
        </div>

        {finished && !playing && (
          <p className="mt-8 text-center text-sm text-muted">
            That&apos;s the end of the document.{" "}
            <Link href="/" className="rounded-sm text-ink underline decoration-1 underline-offset-4 hover:text-orp">
              Back to the library
            </Link>{" "}
            or press play to start over.
          </p>
        )}
      </div>
    </div>
  );
}
