"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { Doc } from "@/lib/types";

/**
 * One document in the library: title (opens the reader), size and an estimated
 * reading time at the reader's speed, progress, and Delete. Delete asks inline
 * ("Yes, delete" / "Keep") before calling `onDelete` once. On mouse-driven screens it
 * only appears on hover or keyboard focus; on touch screens it is always visible.
 */
export function DocumentRow({
  doc,
  wpm,
  onDelete,
}: {
  doc: Doc;
  wpm: number;
  onDelete: (doc: Doc) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const backedOut = useRef(false);

  // Keyboard focus follows the question: onto "Yes, delete" when it appears, and
  // back onto Delete after "Keep".
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
    else if (backedOut.current) deleteButton.current?.focus();
  }, [confirming]);

  // Disabled while the delete runs, so a double click deletes once; re-enabled if it
  // failed and the row is still here.
  const confirmDelete = () => {
    setDeleting(true);
    Promise.resolve(onDelete(doc)).finally(() => setDeleting(false));
  };
  const keep = () => {
    backedOut.current = true;
    setConfirming(false);
  };

  const percent = doc.progress?.percent_complete ?? 0;
  const finished = doc.progress?.finished ?? false;
  const started = !finished && (doc.progress?.word_index ?? 0) > 0;

  return (
    <li className="group flex items-start gap-4 border-b border-rule py-4">
      <div className="min-w-0 flex-1">
        <Link
          href={`/read/${doc.id}`}
          className="block truncate rounded-sm font-serif text-lg leading-snug hover:underline hover:decoration-1 hover:underline-offset-4"
          title={doc.title}
        >
          {doc.title}
        </Link>
        <p className="mt-1 text-sm text-faint">
          {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}, {doc.word_count.toLocaleString()} words,
          about {formatDuration(doc.word_count / wpm)} at {wpm} wpm
        </p>
      </div>

      <div className="w-24 shrink-0 pt-1.5 text-right text-sm tabular-nums sm:w-28">
        {finished ? (
          <span className="text-muted">Finished</span>
        ) : started ? (
          <>
            <span>{Math.floor(percent)}%</span>
            <span className="mt-2 block h-px w-full bg-rule">
              <span className="block h-px bg-ink" style={{ width: `${percent}%` }} />
            </span>
          </>
        ) : (
          <span className="text-faint">Not started</span>
        )}
      </div>

      {confirming ? (
        <span role="group" aria-label={`Delete ${doc.title}?`} className="flex shrink-0 items-center gap-1 text-sm">
          <button
            ref={confirmButton}
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="tap rounded-sm px-2 text-orp hover:underline hover:decoration-1 hover:underline-offset-4"
          >
            Yes, delete
          </button>
          <button
            type="button"
            onClick={keep}
            className="tap rounded-sm px-2 text-muted hover:text-ink"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          ref={deleteButton}
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${doc.title}`}
          className="tap shrink-0 rounded-sm px-1 pt-1.5 text-sm text-faint hover:text-orp focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
        >
          Delete
        </button>
      )}
    </li>
  );
}
