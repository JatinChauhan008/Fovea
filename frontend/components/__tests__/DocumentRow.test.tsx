/** A library row: progress states and the inline delete confirmation. */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Doc } from "@/lib/types";
import { DocumentRow } from "../DocumentRow";

const doc: Doc = {
  id: 3,
  title: "A Long Book",
  original_filename: "book.pdf",
  page_count: 12,
  word_count: 6000,
  status: "ready",
  error: null,
  created_at: "",
  progress: null,
};

function renderRow(overrides: Partial<Doc> = {}, onDelete = vi.fn()) {
  render(
    <ul>
      <DocumentRow doc={{ ...doc, ...overrides }} wpm={300} onDelete={onDelete} />
    </ul>,
  );
  return onDelete;
}

describe("DocumentRow", () => {
  it("shows size and an estimate at the reader's speed", () => {
    renderRow();
    expect(screen.getByText(/12 pages, 6,000 words, about 20 min at 300 wpm/)).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("shows Finished when the server says the document is finished", () => {
    renderRow({
      progress: {
        document_id: 3,
        word_index: 5900,
        page: 12,
        wpm: 300,
        updated_at: "",
        percent_complete: 98.3,
        finished: true,
      },
    });
    expect(screen.getByText("Finished")).toBeInTheDocument();
  });

  it("asks before deleting, inline", async () => {
    const onDelete = renderRow();

    await userEvent.click(screen.getByRole("button", { name: "Delete A Long Book" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yes, delete" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
  });

  it("can back out of deleting", async () => {
    const onDelete = renderRow();

    await userEvent.click(screen.getByRole("button", { name: "Delete A Long Book" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete A Long Book" })).toHaveFocus();
  });

  it("deletes once however many times the confirm is clicked", async () => {
    // A delete still on its way to the server.
    const onDelete = renderRow({}, vi.fn(() => new Promise<void>(() => {})));

    await userEvent.click(screen.getByRole("button", { name: "Delete A Long Book" }));
    await userEvent.dblClick(screen.getByRole("button", { name: "Yes, delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });
});
