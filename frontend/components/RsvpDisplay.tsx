"use client";

import type { WordToken } from "@/lib/types";

interface Props {
  tokens: WordToken[];
  index: number;
  playing: boolean;
}

const CONTEXT_WORDS = 8;

/**
 * One word, held still.
 *
 * The word is laid out in three grid columns - everything before the ORP letter,
 * the ORP letter itself, everything after - with equal flexible columns on either
 * side. That pins the highlighted letter to the exact centre of the frame no
 * matter how long the word is, so the reader's eye never has to move.
 */
export function RsvpDisplay({ tokens, index, playing }: Props) {
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
      <div className="relative border-y border-rule">
        <span aria-hidden className="absolute left-1/2 top-0 h-3 w-px bg-ink" />
        <span aria-hidden className="absolute bottom-0 left-1/2 h-3 w-px bg-ink" />

        <div
          className="reader-word grid grid-cols-[1fr_auto_1fr] items-baseline py-12 text-5xl leading-none sm:py-14 sm:text-6xl"
          aria-live={playing ? "off" : "polite"}
          aria-atomic="true"
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
        </div>
      </div>

      {/* When paused, show the surrounding words so the reader can re-orient. */}
      <p
        className={`mx-auto mt-6 max-w-xl text-center font-serif leading-relaxed text-faint transition-opacity duration-200 ${
          playing ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden={playing}
      >
        {lead.join(" ")} <span className="text-ink">{token?.t}</span> {trail.join(" ")}
      </p>
    </div>
  );
}
