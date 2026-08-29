"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Doc } from "@/lib/types";

export function UploadDropzone({ onUploaded }: { onUploaded: (doc: Doc) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onUploaded(await api.upload(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
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
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-brand bg-brand/5" : "border-line bg-surface/50"
        }`}
      >
        <p className="text-sm text-muted">
          {busy ? "Extracting text…" : "Drop a PDF here, or"}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="focus-ring mt-3 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => handle(event.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-orp/40 bg-orp/10 p-3 text-sm text-orp">
          {error}
        </p>
      )}
    </div>
  );
}
