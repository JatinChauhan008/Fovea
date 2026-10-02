"use client";

/*
 * The library: upload PDFs, continue the last one, see progress, delete.
 *
 * Docs: ./architecture.md
 */

import { useEffect, useMemo, useState } from "react";
import { DocumentRow } from "@/components/DocumentRow";
import { ErrorText, PageHeading, PageLoading, TextLink } from "@/components/PageParts";
import { UploadDropzone } from "@/components/UploadDropzone";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { DEFAULT_WPM } from "@/lib/constants";
import type { Doc } from "@/lib/types";

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
      (doc) => doc.progress && doc.progress.word_index > 0 && !doc.progress.finished,
    );
    open.sort((a, b) => b.progress!.updated_at.localeCompare(a.progress!.updated_at));
    return open[0] ?? null;
  }, [docs]);

  if (loading || !user) return <PageLoading />;

  const wpm = user.preferred_wpm || DEFAULT_WPM;

  return (
    <div className="pb-20 pt-8">
      <PageHeading>Library</PageHeading>

      {lastRead?.progress && (
        <p className="mt-3 text-muted">
          You were on page {lastRead.progress.page} of{" "}
          <TextLink href={`/read/${lastRead.id}`}>{lastRead.title}</TextLink>.
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

      {error && <ErrorText className="mt-4">{error}</ErrorText>}

      <section className="mt-10" aria-label="Your documents">
        {fetching ? (
          <PageLoading inline label="Loading your documents…" />
        ) : docs.length === 0 && !error ? (
          <p className="max-w-prose text-muted">Nothing here yet. Add a PDF to start reading.</p>
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
