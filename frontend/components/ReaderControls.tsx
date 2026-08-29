"use client";

import { WPM_PRESETS } from "@/lib/constants";

interface Props {
  playing: boolean;
  wpm: number;
  index: number;
  total: number;
  page: number;
  pageCount: number;
  percent: number;
  minutesLeft: number;
  onToggle: () => void;
  onStep: (direction: -1 | 1) => void;
  onSentence: (direction: -1 | 1) => void;
  onSeek: (index: number) => void;
  onWpm: (wpm: number) => void;
  onJumpToPage: (page: number) => void;
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-brand/40 hover:text-text"
    >
      {children}
    </button>
  );
}

export function ReaderControls({
  playing,
  wpm,
  index,
  total,
  page,
  pageCount,
  percent,
  minutesLeft,
  onToggle,
  onStep,
  onSentence,
  onSeek,
  onWpm,
  onJumpToPage,
}: Props) {
  return (
    <div className="space-y-5">
      {/* Scrubber */}
      <div>
        <input
          type="range"
          min={0}
          max={Math.max(total - 1, 0)}
          value={index}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Position in document"
          className="focus-ring h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span>
            word {index.toLocaleString()} / {total.toLocaleString()} &middot;{" "}
            {percent.toFixed(1)}%
          </span>
          <span>
            page {page} / {pageCount} &middot; ~{Math.ceil(minutesLeft)} min left
          </span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <IconButton label="Previous sentence" onClick={() => onSentence(-1)}>
          <span aria-hidden>&#171;</span>
        </IconButton>
        <IconButton label="Previous word" onClick={() => onStep(-1)}>
          <span aria-hidden>&#8249;</span>
        </IconButton>

        <button
          type="button"
          onClick={onToggle}
          className="focus-ring flex h-12 min-w-32 items-center justify-center gap-2 rounded-xl bg-brand px-6 font-semibold text-ink transition-transform hover:scale-[1.02]"
        >
          {playing ? "Pause" : "Play"}
          <span className="text-xs font-normal opacity-70">space</span>
        </button>

        <IconButton label="Next word" onClick={() => onStep(1)}>
          <span aria-hidden>&#8250;</span>
        </IconButton>
        <IconButton label="Next sentence" onClick={() => onSentence(1)}>
          <span aria-hidden>&#187;</span>
        </IconButton>
      </div>

      {/* Speed */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-line p-1">
          {WPM_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onWpm(preset)}
              className={`focus-ring rounded-md px-3 py-1.5 text-sm transition-colors ${
                wpm === preset
                  ? "bg-brand text-ink font-medium"
                  : "text-muted hover:bg-raised hover:text-text"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="range"
            min={100}
            max={900}
            step={25}
            value={wpm}
            onChange={(event) => onWpm(Number(event.target.value))}
            aria-label="Words per minute"
            className="focus-ring h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-line accent-brand"
          />
          <span className="w-20 tabular-nums">{wpm} wpm</span>
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          Page
          <input
            type="number"
            min={1}
            max={pageCount}
            defaultValue={page}
            key={page}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onJumpToPage(Number((event.target as HTMLInputElement).value));
              }
            }}
            aria-label="Jump to page"
            className="focus-ring w-16 rounded-md border border-line bg-surface px-2 py-1 text-text"
          />
        </label>
      </div>

      <p className="text-center text-xs text-muted/70">
        space play/pause &middot; &larr; &rarr; word &middot; shift + &larr; &rarr; sentence
        &middot; &uarr; &darr; speed
      </p>
    </div>
  );
}
