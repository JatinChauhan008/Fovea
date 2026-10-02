"use client";

/*
 * The library: upload PDFs, continue the last one, see progress, delete.
 *
 * Docs: ./architecture.md
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { DEFAULT_WPM } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import type { Doc } from "@/lib/types";

function DocumentRow({
  doc,
  wpm,
  onDelete,
}: {
  doc: Doc;
  wpm: number;
  onDelete: (doc: Doc) => void;
}) {
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

      <div className="w-28 shrink-0 pt-1.5 text-right text-sm tabular-nums">
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

      <button
        type="button"
        onClick={() => onDelete(doc)}
        aria-label={`Delete ${doc.title}`}
        className="shrink-0 rounded-sm pt-1.5 text-sm text-faint opacity-100 hover:text-orp focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
      >
        Delete
      </button>
    </li>
  );
}

export default function LibraryPage() {
  const { user, loading } = useRequireAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  // Keyed on the account, not the account object, so a speed update doesn't refetch.
  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined) return;
    api
      .documents()
      .then(setDocs)
      .catch((err) => setError(err.message))
      .finally(() => setFetching(false));
  }, [userId]);

  const remove = async (target: Doc) => {
    if (!window.confirm(`Delete "${target.title}"? Your place in it and its reading history go too.`)) {
      return;
    }
    try {
      await api.deleteDocument(target.id);
      setDocs((current) => current.filter((doc) => doc.id !== target.id));
    } catch (err) {
      setError(`Could not delete "${target.title}": ${(err as Error).message}`);
    }
  };

  // The document touched most recently that still has words left in it.
  const lastRead = useMemo(() => {
    const open = docs.filter(
      (doc) =>
        doc.progress && doc.progress.word_index > 0 && !doc.progress.finished,
    );
    open.sort((a, b) => b.progress!.updated_at.localeCompare(a.progress!.updated_at));
    return open[0] ?? null;
  }, [docs]);

  if (loading || !user) return null;

  const wpm = user.preferred_wpm || DEFAULT_WPM;

  return (
    <div className="pt-8">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Library</h1>

      {lastRead?.progress && (
        <p className="mt-3 text-muted">
          You were on page {lastRead.progress.page} of{" "}
          <Link
            href={`/read/${lastRead.id}`}
            className="rounded-sm text-ink underline decoration-1 underline-offset-4 hover:text-orp"
          >
            {lastRead.title}
          </Link>
          .
        </p>
      )}

      <div className="mt-8">
        <UploadDropzone
          onUploaded={(doc) => {
            setDocs((current) => [doc, ...current]);
            setError(null);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-orp">
          {error}
        </p>
      )}

      <section className="mt-10">
        {fetching ? (
          <p className="text-sm text-faint">Loading your documents…</p>
        ) : docs.length === 0 ? (
          <p className="max-w-prose text-muted">
            Nothing here yet. Add a PDF and Fovea will pull the text out of it, then show it to you
            one word at a time, with the letter your eye should land on marked in red.
          </p>
        ) : (
          <ul className="border-t border-rule">
            {docs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} wpm={wpm} onDelete={remove} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
