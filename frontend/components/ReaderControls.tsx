"use client";

import { useState } from "react";
import { WPM_PRESETS, WPM_STEP } from "@/lib/constants";
import { formatDuration } from "@/lib/format";

interface Props {
  playing: boolean;
  wpm: number;
  minWpm: number;
  maxWpm: number;
  index: number;
  total: number;
  loadedCount: number;
  page: number;
  pageCount: number;
  /** A "go to page" waiting for that page to load. */
  waitingForPage: number | null;
  minutesLeft: number;
  onToggle: () => void;
  onStep: (direction: -1 | 1) => void;
  onSentence: (direction: -1 | 1) => void;
  onSeek: (index: number) => void;
  onWpm: (wpm: number) => void;
  onJumpToPage: (page: number) => void;
}

function timeLeft(minutes: number) {
  if (minutes < 1) return "under a minute left";
  return `${formatDuration(Math.ceil(minutes))} left`;
}

export function ReaderControls({
  playing,
  wpm,
  minWpm,
  maxWpm,
  index,
  total,
  loadedCount,
  page,
  pageCount,
  waitingForPage,
  minutesLeft,
  onToggle,
  onStep,
  onSentence,
  onSeek,
  onWpm,
  onJumpToPage,
}: Props) {
  const [pageDraft, setPageDraft] = useState("");

  const seekFill = total > 1 ? (index / (total - 1)) * 100 : 0;
  const wpmFill = ((wpm - minWpm) / (maxWpm - minWpm)) * 100;

  const submitPage = (event: React.FormEvent) => {
    event.preventDefault();
    const target = Number(pageDraft);
    if (Number.isInteger(target) && target >= 1 && target <= pageCount) {
      onJumpToPage(target);
      setPageDraft("");
    }
  };

  return (
    <div className="space-y-8 text-sm">
      <div>
        <input
          type="range"
          min={0}
          max={Math.max(total - 1, 0)}
          value={index}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Position in document"
          className="slider w-full"
          style={{ ["--fill" as string]: `${seekFill}%` }}
        />
        <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-faint tabular-nums">
          <span>
            Word {(index + 1).toLocaleString()} of {total.toLocaleString()}, page {page} of {pageCount}
          </span>
          <span>{timeLeft(minutesLeft)} at this speed</span>
        </div>
        {waitingForPage !== null ? (
          <p className="mt-1 text-muted" role="status">
            Loading page {waitingForPage}…
          </p>
        ) : (
          loadedCount < total && (
            <p className="mt-1 text-faint tabular-nums">
              Still loading the rest of the text ({loadedCount.toLocaleString()} of {total.toLocaleString()} words).
            </p>
          )
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button type="button" onClick={() => onSentence(-1)} className="btn" title="Previous sentence (Shift ←)">
          <span aria-hidden>«</span>
          <span className="sr-only">Previous sentence</span>
        </button>
        <button type="button" onClick={() => onStep(-1)} className="btn" title="Previous word (←)">
          <span aria-hidden>‹</span>
          <span className="sr-only">Previous word</span>
        </button>
        <button type="button" onClick={onToggle} className="btn btn-solid w-28 py-2">
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => onStep(1)} className="btn" title="Next word (→)">
          <span aria-hidden>›</span>
          <span className="sr-only">Next word</span>
        </button>
        <button type="button" onClick={() => onSentence(1)} className="btn" title="Next sentence (Shift →)">
          <span aria-hidden>»</span>
          <span className="sr-only">Next sentence</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-rule pt-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex items-center gap-3">
            <span className="text-muted">Speed</span>
            <input
              type="range"
              min={minWpm}
              max={maxWpm}
              step={WPM_STEP}
              value={wpm}
              onChange={(event) => onWpm(Number(event.target.value))}
              aria-label="Words per minute"
              className="slider w-28 sm:w-32"
              style={{ ["--fill" as string]: `${wpmFill}%` }}
            />
            <span className="w-16 tabular-nums">{wpm} wpm</span>
          </label>
          <div role="group" aria-label="Speed presets" className="flex gap-1 tabular-nums">
            {WPM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onWpm(preset)}
                aria-pressed={wpm === preset}
                className={`tap rounded-sm px-1 ${
                  wpm === preset
                    ? "text-ink underline decoration-1 underline-offset-4"
                    : "text-faint hover:text-ink"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submitPage} className="flex items-center gap-2 text-muted">
          <label htmlFor="jump-page">Page</label>
          <input
            id="jump-page"
            type="number"
            inputMode="numeric"
            min={1}
            max={pageCount}
            value={pageDraft}
            placeholder={String(page)}
            onChange={(event) => setPageDraft(event.target.value)}
            className="field w-16 px-2 py-1 text-center tabular-nums"
          />
          <span className="tabular-nums">of {pageCount}</span>
        </form>
      </div>

      {/* Only for keyboard-and-mouse readers; touch readers tap the word instead. */}
      <details className="hidden text-center text-xs text-faint pointer-fine:block">
        <summary className="cursor-pointer rounded-sm">Keyboard shortcuts</summary>
        <p className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1">
          <span><span className="kbd">Space</span> play or pause</span>
          <span><span className="kbd">←</span> <span className="kbd">→</span> word</span>
          <span><span className="kbd">Shift</span> + arrows sentence</span>
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> speed</span>
          <span><span className="kbd">Esc</span> pause</span>
        </p>
      </details>
    </div>
  );
}
