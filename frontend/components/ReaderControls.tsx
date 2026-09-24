"use client";

import { useState } from "react";
import { WPM_PRESETS } from "@/lib/constants";

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
  const rounded = Math.ceil(minutes);
  if (rounded < 60) return `${rounded} min left`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} h left` : `${h} h ${m} min left`;
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
        {loadedCount < total && (
          <p className="mt-1 text-faint tabular-nums">
            Still loading the rest of the text ({loadedCount.toLocaleString()} of {total.toLocaleString()} words).
          </p>
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

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-rule pt-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-muted">Speed</span>
          <div className="flex gap-3 tabular-nums">
            {WPM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onWpm(preset)}
                aria-pressed={wpm === preset}
                className={`rounded-sm ${
                  wpm === preset
                    ? "text-ink underline decoration-1 underline-offset-4"
                    : "text-faint hover:text-ink"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3">
            <input
              type="range"
              min={minWpm}
              max={maxWpm}
              step={25}
              value={wpm}
              onChange={(event) => onWpm(Number(event.target.value))}
              aria-label="Words per minute"
              className="slider w-32"
              style={{ ["--fill" as string]: `${wpmFill}%` }}
            />
            <span className="w-16 tabular-nums">{wpm} wpm</span>
          </label>
        </div>

        <form onSubmit={submitPage} className="flex items-center gap-2">
          <label htmlFor="jump-page" className="whitespace-nowrap text-muted">
            Go to page
          </label>
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
        </form>
      </div>

      <p className="hidden flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-faint sm:flex">
        <span><span className="kbd">Space</span> play or pause</span>
        <span><span className="kbd">←</span> <span className="kbd">→</span> word</span>
        <span><span className="kbd">Shift</span> + arrows sentence</span>
        <span><span className="kbd">↑</span> <span className="kbd">↓</span> speed</span>
      </p>
    </div>
  );
}
