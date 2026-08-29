"use client";

import type { WordToken } from "@/lib/types";

interface Props {
  tokens: WordToken[];
  index: number;
  playing: boolean;
}

const CONTEXT_WORDS = 7;

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

  if (!token) {
    return (
      <div className="flex h-56 items-center justify-center text-muted">
        Nothing to read yet.
      </div>
    );
  }

  const orp = Math.min(token.o, token.t.length - 1);
  const before = token.t.slice(0, orp);
  const letter = token.t.slice(orp, orp + 1);
  const after = token.t.slice(orp + 1);

  const context = tokens
    .slice(Math.max(0, index - CONTEXT_WORDS), index + CONTEXT_WORDS + 1)
    .map((item) => item.t)
    .join(" ");

  return (
    <div className="select-none">
      <div className="relative">
        {/* Focus guides mark where the eye should rest. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <span className="h-4 w-px bg-line" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
          <span className="h-4 w-px bg-line" />
        </div>

        <div
          className="reader-word grid grid-cols-[1fr_auto_1fr] items-center py-10 text-5xl leading-none tracking-tight sm:text-6xl md:py-14 md:text-7xl"
          aria-live={playing ? "off" : "polite"}
          aria-atomic="true"
        >
          <span className="justify-self-end text-text">{before}</span>
          <span className="text-orp">{letter}</span>
          <span className="justify-self-start text-text">{after}</span>
        </div>
      </div>

      {/* When paused, show the surrounding words so the reader can re-orient. */}
      <p
        className={`mx-auto mt-2 max-w-2xl text-center text-sm leading-relaxed text-muted transition-opacity duration-200 ${
          playing ? "opacity-0" : "opacity-100"
        }`}
      >
        {context}
      </p>
    </div>
  );
}
