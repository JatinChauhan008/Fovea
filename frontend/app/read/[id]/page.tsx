"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QuizPanel } from "@/components/QuizPanel";
import { ReaderControls } from "@/components/ReaderControls";
import { RsvpDisplay } from "@/components/RsvpDisplay";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import {
  CONTENT_CHUNK,
  DEFAULT_WPM,
  MIN_QUIZ_WORDS,
  PROGRESS_SAVE_INTERVAL_MS,
} from "@/lib/constants";
import type { Doc, WordToken } from "@/lib/types";
import { useRsvp, type ReadingStretch } from "@/lib/useRsvp";

interface Loaded {
  doc: Doc;
  tokens: WordToken[];
  total: number;
  startIndex: number;
  startWpm: number;
}

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const documentId = Number(params.id);
  const { user, loading } = useRequireAuth();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || Number.isNaN(documentId)) return;
    let cancelled = false;

    (async () => {
      try {
        const doc = await api.document(documentId);
        const first = await api.content(documentId, 0, CONTENT_CHUNK);
        if (cancelled) return;

        // Accumulate chunks in a plain array so React state isn't updated (and
        // array identity doesn't change) on every chunk. A new identity on every
        // append would re-render useRsvp/RsvpDisplay on each network round-trip,
        // causing O(n²) allocations across a long document.
        const accumulated: WordToken[] = [...first.tokens];

        setLoaded({
          doc,
          tokens: accumulated,
          total: first.total,
          startIndex: doc.progress?.word_index ?? 0,
          startWpm: doc.progress?.wpm ?? user.preferred_wpm ?? DEFAULT_WPM,
        });

        // Stream remaining chunks into the accumulator, then flush into state once
        // all chunks have arrived so the array identity only changes once.
        let fetched = first.tokens.length;
        while (fetched < first.total && !cancelled) {
          const next = await api.content(documentId, fetched, CONTENT_CHUNK);
          if (cancelled || next.tokens.length === 0) break;
          for (const tok of next.tokens) accumulated.push(tok);
          fetched += next.tokens.length;
        }

        if (!cancelled && fetched >= first.total) {
          // Replace the tokens array once with the fully-loaded stable copy.
          setLoaded((current) =>
            current ? { ...current, tokens: [...accumulated] } : current,
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

  if (loading || !user) return <p className="py-20 text-center text-muted">Loading…</p>;

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-orp">{error}</p>
        <Link href="/" className="focus-ring mt-4 inline-block rounded text-brand hover:underline">
          Back to library
        </Link>
      </div>
    );
  }

  if (!loaded) return <p className="py-20 text-center text-muted">Preparing document…</p>;

  return <Reader key={loaded.doc.id} {...loaded} />;
}

function Reader({ doc, tokens, total, startIndex, startWpm }: Loaded) {
  // Reaching the end of the document closes out the current stretch. The
  // handler is defined below, so the reader reaches it through this ref.
  const onFinishRef = useRef<() => void>(() => {});

  const rsvp = useRsvp({
    tokens,
    initialIndex: startIndex,
    initialWpm: startWpm,
    onFinish: () => onFinishRef.current(),
  });
  const {
    index,
    wpm,
    playing,
    finished,
    page,
    percent,
    stats,
    setWpm,
    toggle,
    pause,
    seek,
    stepBack,
    stepForward,
    stepSentence,
    jumpToPage,
    consumeStretch,
  } = rsvp;

  const [stretch, setStretch] = useState<ReadingStretch | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(doc.summary);
  const [summarising, setSummarising] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Keep the latest position available to the progress saver without
  // re-creating the interval on every word.
  const positionRef = useRef({ index, page, wpm });
  useEffect(() => {
    positionRef.current = { index, page, wpm };
  }, [index, page, wpm]);

  const saveProgress = useCallback(() => {
    const { index: at, page: onPage, wpm: atWpm } = positionRef.current;
    api.saveProgress(doc.id, at, onPage, atWpm).catch(() => {});
  }, [doc.id]);

  // Periodic autosave while reading, plus a final save on the way out.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(saveProgress, PROGRESS_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, saveProgress]);

  useEffect(() => saveProgress, [saveProgress]);

  /** Close out the stretch just read: save it, log it, and remember its range. */
  const finishStretch = useCallback(() => {
    const done = consumeStretch();
    saveProgress();
    if (!done) return;

    setStretch(done);
    api
      .recordSession({
        document_id: doc.id,
        start_index: done.startIndex,
        end_index: done.endIndex,
        wpm,
        duration_seconds: done.seconds,
      })
      .catch(() => {});
  }, [consumeStretch, doc.id, saveProgress, wpm]);

  const handleToggle = useCallback(() => {
    if (playing) {
      pause();
      finishStretch();
    } else {
      toggle();
    }
  }, [playing, pause, finishStretch, toggle]);

  useEffect(() => {
    onFinishRef.current = finishStretch;
  }, [finishStretch]);

  // Browsers throttle timers in hidden tabs, so a reader who switches away would
  // come back to a position that crept forward at about one word per second -
  // and to a logged session claiming they read at that speed. Stop cleanly instead.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden && playing) {
        pause();
        finishStretch();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [playing, pause, finishStretch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (event.key) {
        case " ":
          // A focused button already activates on space. Handling it here too
          // would toggle twice and leave the reader exactly where it started.
          if (tag === "BUTTON") return;
          event.preventDefault();
          handleToggle();
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
          setWpm(Math.min(900, wpm + 25));
          break;
        case "ArrowDown":
          event.preventDefault();
          setWpm(Math.max(100, wpm - 25));
          break;
        case "Escape":
          if (playing) handleToggle();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleToggle, playing, setWpm, stepBack, stepForward, stepSentence, wpm]);

  const summarise = async () => {
    setShowSummary(true);
    if (summary) return;
    setSummarising(true);
    try {
      setSummary((await api.summarize(doc.id)).summary);
    } catch (err) {
      setSummary(`Could not generate a summary: ${(err as Error).message}`);
    } finally {
      setSummarising(false);
    }
  };

  const quizRange = stretch ?? {
    startIndex: Math.max(0, index - 400),
    endIndex: index,
    seconds: 0,
  };
  const quizReady = quizRange.endIndex - quizRange.startIndex >= MIN_QUIZ_WORDS;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 py-5">
        <Link
          href="/"
          className="focus-ring rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-text"
        >
          &larr; Library
        </Link>
        <h1 className="truncate text-sm text-muted" title={doc.title}>
          {doc.title}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={summarise}
            className="focus-ring rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-text"
          >
            Summary
          </button>
          <button
            type="button"
            disabled={!quizReady}
            onClick={() => {
              if (playing) handleToggle();
              setQuizOpen(true);
            }}
            title={
              quizReady
                ? "Check what you retained"
                : `Read at least ${MIN_QUIZ_WORDS} words first`
            }
            className="focus-ring rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            Comprehension check
          </button>
        </div>
      </header>

      {showSummary && (
        <div className="mb-6 rounded-xl border border-line bg-surface p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Summary
            </h2>
            <button
              type="button"
              onClick={() => setShowSummary(false)}
              className="focus-ring rounded px-2 text-muted hover:text-text"
              aria-label="Hide summary"
            >
              &times;
            </button>
          </div>
          <p className="text-sm leading-relaxed text-text/90">
            {summarising ? "Reading the document…" : summary}
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col justify-center">
        <RsvpDisplay tokens={tokens} index={index} playing={playing} />

        <div className="mx-auto mt-10 w-full max-w-2xl">
          <ReaderControls
            playing={playing}
            wpm={wpm}
            index={index}
            total={total}
            page={page}
            pageCount={doc.page_count}
            percent={percent}
            minutesLeft={stats.minutesLeft}
            onToggle={handleToggle}
            onStep={(direction) => (direction === -1 ? stepBack() : stepForward())}
            onSentence={stepSentence}
            onSeek={seek}
            onWpm={setWpm}
            onJumpToPage={jumpToPage}
          />
        </div>

        {tokens.length < total && (
          <p className="mt-6 text-center text-xs text-muted/70">
            Loading the rest of the document… ({tokens.length.toLocaleString()} of{" "}
            {total.toLocaleString()} words ready)
          </p>
        )}

        {finished && (
          <p className="mt-6 text-center text-sm text-brand">
            You reached the end of this document.
          </p>
        )}
      </div>

      {quizOpen && (
        <QuizPanel
          documentId={doc.id}
          startIndex={quizRange.startIndex}
          endIndex={quizRange.endIndex}
          wpm={wpm}
          onClose={() => setQuizOpen(false)}
          onApplyWpm={setWpm}
        />
      )}
    </div>
  );
}
