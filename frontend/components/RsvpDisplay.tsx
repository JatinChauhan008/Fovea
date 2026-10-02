"use client";

import type { WordToken } from "@/lib/types";
import { wordFontSize } from "@/lib/wordSize";

interface Props {
  tokens: WordToken[];
  index: number;
  playing: boolean;
  /** Tapping or clicking the word plays or pauses. */
  onToggle: () => void;
}

const CONTEXT_WORDS = 8;

/**
 * One word, held still.
 *
 * The word is laid out in three grid columns - everything before the ORP letter,
 * the ORP letter itself, everything after - with equal flexible columns on either
 * side. That pins the highlighted letter to the exact centre of the frame no
 * matter how long the word is, so the reader's eye never has to move. Long words
 * shrink to fit (wordFontSize). The whole frame is a Play/Pause button, so a
 * phone reader can tap the word; screen readers hear the word through a separate
 * live region while paused.
 */
export function RsvpDisplay({ tokens, index, playing, onToggle }: Props) {
  const token = tokens[index];

  const orp = token ? Math.min(token.o, token.t.length - 1) : 0;
  const before = token?.t.slice(0, orp) ?? "";
  const letter = token?.t.slice(orp, orp + 1) ?? "";
  const after = token?.t.slice(orp + 1) ?? "";

  const lead = tokens.slice(Math.max(0, index - CONTEXT_WORDS), index).map((item) => item.t);
  const trail = tokens.slice(index + 1, index + CONTEXT_WORDS + 1).map((item) => item.t);

  return (
    <div className="select-none">
      {/* Reticle: two rules with a notch marking the column the eye rests on. */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Tap word to pause" : "Tap word to play"}
        className="relative block w-full cursor-pointer rounded-sm border-y border-rule"
      >
        <span aria-hidden className="absolute left-1/2 top-0 h-3 w-px bg-ink" />
        <span aria-hidden className="absolute bottom-0 left-1/2 h-3 w-px bg-ink" />

        <span
          aria-hidden
          className="reader-word grid grid-cols-[1fr_auto_1fr] items-baseline py-12 leading-none sm:py-14"
          style={{ fontSize: wordFontSize(before, after) }}
        >
          {token ? (
            <>
              <span className="justify-self-end">{before}</span>
              <span className="text-orp">{letter}</span>
              <span className="justify-self-start">{after}</span>
            </>
          ) : (
            <span className="col-span-3 text-center text-base text-faint">No text to show.</span>
          )}
        </span>
      </button>

      <p className="sr-only" aria-live={playing ? "off" : "polite"} aria-atomic="true">
        {token?.t ?? ""}
      </p>

      {/* When paused, show the surrounding words so the reader can re-orient. */}
      <p
        className={`mx-auto mt-6 max-w-xl text-center font-serif leading-relaxed text-faint transition-opacity duration-200 ${
          playing ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      >
        {lead.join(" ")} <span className="text-ink">{token?.t}</span> {trail.join(" ")}
      </p>
    </div>
  );
}
