/**
 * Loading a document for the reader: words up to the saved place arrive before
 * reading starts, and the rest streams in behind it.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Content, Doc, User, WordToken } from "../types";
import { useDocumentWords } from "../useDocumentWords";

const documentMock = vi.fn();
const contentMock = vi.fn();
vi.mock("../api", () => ({
  api: {
    document: (...args: unknown[]) => documentMock(...args),
    content: (...args: unknown[]) => contentMock(...args),
  },
}));
vi.mock("../constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../constants")>()),
  CONTENT_CHUNK: 2,
}));

const reader: User = { id: 1, email: "a@example.com", preferred_wpm: 320, created_at: "" };
const words: WordToken[] = ["a", "b", "c", "d", "e"].map((t) => ({ t, o: 0, m: 1, p: 1 }));

function doc(progress: Doc["progress"] = null): Doc {
  return {
    id: 9,
    title: "Book",
    original_filename: "book.pdf",
    page_count: 1,
    word_count: words.length,
    status: "ready",
    error: null,
    created_at: "",
    progress,
  };
}

function serveWords() {
  contentMock.mockImplementation(async (_id: number, start: number, limit: number) => {
    const tokens = words.slice(start, start + limit);
    return { document_id: 9, start, count: tokens.length, total: words.length, page_count: 1, tokens } satisfies Content;
  });
}

describe("useDocumentWords", () => {
  beforeEach(() => {
    documentMock.mockReset();
    contentMock.mockReset();
  });

  it("starts at the reader's preferred speed from the beginning of a new document", async () => {
    documentMock.mockResolvedValue(doc());
    serveWords();

    const { result } = renderHook(() => useDocumentWords(9, reader));

    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(result.current.loaded).toMatchObject({ startIndex: 0, startWpm: 320, total: 5 });
  });

  it("loads up to the saved place before reading starts, then streams the rest", async () => {
    documentMock.mockResolvedValue(
      doc({ document_id: 9, word_index: 3, page: 1, wpm: 410, updated_at: "", percent_complete: 60, finished: false }),
    );
    serveWords();

    const { result } = renderHook(() => useDocumentWords(9, reader));

    await waitFor(() => expect(result.current.loaded).not.toBeNull());
    expect(result.current.loaded?.startIndex).toBe(3);
    expect(result.current.loaded?.startWpm).toBe(410);
    expect(result.current.loaded!.tokens.length).toBeGreaterThan(3);
    await waitFor(() => expect(result.current.loaded?.tokens).toHaveLength(5));
  });

  it("reports a link that isn't a document number", async () => {
    const { result } = renderHook(() => useDocumentWords(Number.NaN, reader));

    await waitFor(() => expect(result.current.error).toBe("That isn't a valid document link."));
    expect(documentMock).not.toHaveBeenCalled();
  });

  it("reports a document that can't be opened", async () => {
    documentMock.mockRejectedValue(new Error("Document not found"));

    const { result } = renderHook(() => useDocumentWords(9, reader));

    await waitFor(() => expect(result.current.error).toBe("Document not found"));
  });

  it("keeps the reader open when a later chunk fails, and says the rest didn't load", async () => {
    documentMock.mockResolvedValue(doc());
    contentMock
      .mockImplementationOnce(async () => ({
        document_id: 9, start: 0, count: 2, total: 5, page_count: 1, tokens: words.slice(0, 2),
      }))
      .mockRejectedValueOnce(new Error("Cannot reach the Fovea API."));

    const { result } = renderHook(() => useDocumentWords(9, reader));

    await waitFor(() => expect(result.current.streamError).toBe("Cannot reach the Fovea API."));
    expect(result.current.error).toBeNull();
    expect(result.current.loaded?.tokens).toHaveLength(2);
  });

  it("waits for the sign-in before loading anything", () => {
    renderHook(() => useDocumentWords(9, null));

    expect(documentMock).not.toHaveBeenCalled();
  });
});
