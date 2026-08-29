"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UploadDropzone } from "@/components/UploadDropzone";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { Doc, Recommendation } from "@/lib/types";

function DocumentCard({
  doc,
  onDelete,
}: {
  doc: Doc;
  onDelete: (id: number) => void;
}) {
  const percent = doc.progress?.percent_complete ?? 0;
  const started = percent > 0.5;

  return (
    <li className="group relative rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand/30">
      <Link href={`/read/${doc.id}`} className="focus-ring block rounded">
        <h3 className="truncate pr-8 font-medium" title={doc.title}>
          {doc.title}
        </h3>
        <p className="mt-1 text-xs text-muted">
          {doc.page_count} pages &middot; {doc.word_count.toLocaleString()} words
        </p>

        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {started
            ? `${percent.toFixed(0)}% read · continue at word ${doc.progress?.word_index.toLocaleString()}`
            : "Not started"}
        </p>
      </Link>

      <button
        type="button"
        onClick={() => onDelete(doc.id)}
        aria-label={`Delete ${doc.title}`}
        className="focus-ring absolute right-3 top-3 rounded p-1 text-muted opacity-0 transition-opacity hover:text-orp focus-visible:opacity-100 group-hover:opacity-100"
      >
        &times;
      </button>
    </li>
  );
}

export default function LibraryPage() {
  const { user, loading } = useRequireAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);

  const refresh = useCallback(() => {
    api
      .documents()
      .then(setDocs)
      .catch((err) => setError(err.message))
      .finally(() => setFetching(false));
    api.recommendation().then(setRecommendation).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const remove = async (id: number) => {
    const target = docs.find((doc) => doc.id === id);
    if (!window.confirm(`Delete "${target?.title}"? This cannot be undone.`)) return;

    await api.deleteDocument(id);
    setDocs((current) => current.filter((doc) => doc.id !== id));
  };

  if (loading || !user) {
    return <p className="py-20 text-center text-muted">Loading…</p>;
  }

  const inProgress = docs.filter(
    (doc) => (doc.progress?.percent_complete ?? 0) > 0.5 &&
      (doc.progress?.percent_complete ?? 0) < 95,
  );

  return (
    <div className="space-y-10 py-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Your library</h1>
        <p className="mt-2 text-muted">
          {recommendation && recommendation.confidence !== "none"
            ? `Fovea suggests ${recommendation.recommended_wpm} WPM for you. ${recommendation.rationale}`
            : "Upload a PDF to start reading. Take a comprehension check afterwards and Fovea will tune your speed."}
        </p>
      </section>

      <UploadDropzone
        onUploaded={(doc) => {
          setDocs((current) => [doc, ...current]);
          setError(null);
        }}
      />

      {error && (
        <p className="rounded-lg border border-orp/40 bg-orp/10 p-3 text-sm text-orp">
          {error}
        </p>
      )}

      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
            Continue reading
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onDelete={remove} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
          All documents
        </h2>

        {fetching ? (
          <p className="text-muted">Loading documents…</p>
        ) : docs.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-8 text-center text-muted">
            Nothing here yet. Your uploaded PDFs will appear in this list.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} onDelete={remove} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
