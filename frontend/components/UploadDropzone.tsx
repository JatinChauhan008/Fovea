"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import type { Doc } from "@/lib/types";

export function UploadDropzone({ onUploaded }: { onUploaded: (doc: Doc) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`);
      return;
    }

    setBusy(file.name);
    try {
      onUploaded(await api.upload(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handle(event.dataTransfer.files[0]);
        }}
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-dashed px-4 py-4 text-sm transition-colors ${
          dragging ? "border-ink bg-sunk" : "border-rule"
        }`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="btn btn-solid"
        >
          {busy ? "Reading…" : "Add a PDF"}
        </button>
        <p className="min-w-0 flex-1 text-muted" aria-live="polite">
          {busy ? (
            <>
              Extracting text from <span className="text-ink">{busy}</span>. Large files take a few seconds.
            </>
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
          onChange={(event) => handle(event.target.files?.[0])}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-orp">
          {error}
        </p>
      )}
    </div>
  );
}
