/** Adding a PDF: upload progress, then extraction, and what happens with several files. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadDropzone } from "../UploadDropzone";

const upload = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { upload: (...args: unknown[]) => upload(...args) },
}));

function pdf(name: string) {
  return new File(["%PDF-1.7"], name, { type: "application/pdf" });
}

function drop(target: HTMLElement, files: File[]) {
  fireEvent.drop(target, { dataTransfer: { files } });
}

describe("UploadDropzone", () => {
  beforeEach(() => {
    upload.mockReset();
  });

  it("shows upload progress, then that the text is being extracted", async () => {
    let report: (fraction: number) => void = () => {};
    let finish: (doc: unknown) => void = () => {};
    upload.mockImplementation((_file: File, onProgress: (f: number) => void) => {
      report = onProgress;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const onUploaded = vi.fn();
    render(<UploadDropzone onUploaded={onUploaded} />);

    drop(screen.getByTestId("dropzone"), [pdf("book.pdf")]);
    act(() => report(0.4));
    expect(screen.getByText(/Uploading book\.pdf… 40%/)).toBeInTheDocument();

    act(() => report(1));
    expect(screen.getByText(/Extracting text from/)).toBeInTheDocument();

    await act(async () => finish({ id: 1 }));
    expect(onUploaded).toHaveBeenCalledWith({ id: 1 });
  });

  it("adds only the first of several dropped files, and says so", async () => {
    upload.mockResolvedValue({ id: 1 });
    render(<UploadDropzone onUploaded={vi.fn()} />);

    await act(async () => drop(screen.getByTestId("dropzone"), [pdf("a.pdf"), pdf("b.pdf")]));

    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0].name).toBe("a.pdf");
    expect(screen.getByText(/Adding only a\.pdf/)).toBeInTheDocument();
  });

  it("keeps the drop highlight while the pointer moves over the button inside", () => {
    render(<UploadDropzone onUploaded={vi.fn()} />);
    const zone = screen.getByTestId("dropzone");

    fireEvent.dragOver(zone);
    // A plain event class, since the test DOM's DragEvent ignores relatedTarget.
    fireEvent(
      zone,
      new MouseEvent("dragleave", { bubbles: true, relatedTarget: screen.getByRole("button") }),
    );

    expect(screen.getByText("Drop it anywhere in this box.")).toBeInTheDocument();
  });
});
