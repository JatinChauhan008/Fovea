"use client";

import { type DragEvent, useRef, useState } from "react";
import { ErrorText } from "@/components/PageParts";
import { api } from "@/lib/api";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import type { Doc } from "@/lib/types";

/** The file being added: its name and how much of it has been sent (0 to 1). */
type Adding = { name: string; sent: number } | null;

/**
 * Add a PDF by button or by dropping it on the box. Oversized files are refused
 * before uploading. While adding, it shows the upload percentage, then that the
 * text is being extracted. Only one file is added at a time; dropping several adds
 * the first and says so.
 */
export function UploadDropzone({ onUploaded }: { onUploaded: (doc: Doc) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [adding, setAdding] = useState<Adding>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (files: FileList | File[] | null | undefined) => {
    const [file, ...others] = Array.from(files ?? []);
    if (!file || adding) return;
    setError(null);
    setNotice(null);

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    if (others.length) setNotice(`Adding only ${file.name}. Add the others one at a time.`);

    setAdding({ name: file.name, sent: 0 });
    try {
      onUploaded(await api.upload(file, (sent) => setAdding({ name: file.name, sent })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Moving over the button inside the box fires dragleave on the box; only a real
  // exit should drop the highlight.
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };

  return (
    <div>
      <div
        data-testid="dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={onDragLeave}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handle(event.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-dashed px-4 py-4 text-sm transition-colors ${
          dragging ? "border-ink bg-sunk" : "border-rule"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={adding !== null}
          className="btn btn-solid"
        >
          {adding ? "Adding…" : "Add a PDF"}
        </button>
        <p className="min-w-0 flex-1 text-muted" aria-live="polite">
          {adding ? (
            adding.sent < 1 ? (
              `Uploading ${adding.name}… ${Math.round(adding.sent * 100)}%`
            ) : (
              <>
                Extracting text from <span className="text-ink">{adding.name}</span>. Large files take a
                few seconds.
              </>
            )
          ) : dragging ? (
            "Drop it anywhere in this box."
          ) : (
            `Or drop one here. Text-based PDFs up to ${MAX_UPLOAD_MB} MB; scanned pages need OCR first.`
          )}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => handle(event.target.files)}
        />
      </div>

      {notice && (
        <p role="status" className="mt-2 text-sm text-muted">
          {notice}
        </p>
      )}
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}
