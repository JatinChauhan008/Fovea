/** The word display: tapping it plays or pauses. */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RsvpDisplay } from "../RsvpDisplay";

const tokens = [
  { t: "Hello", o: 1, m: 1, p: 1 },
  { t: "world", o: 1, m: 1, p: 1 },
];

describe("RsvpDisplay", () => {
  it("plays or pauses when the word is tapped", async () => {
    const onToggle = vi.fn();
    render(<RsvpDisplay tokens={tokens} index={0} playing={false} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole("button", { name: "Tap word to play" }));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("is labelled for pausing while reading", () => {
    render(<RsvpDisplay tokens={tokens} index={0} playing onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tap word to pause" })).toBeInTheDocument();
  });

  it("marks the recognition letter", () => {
    render(<RsvpDisplay tokens={tokens} index={0} playing={false} onToggle={vi.fn()} />);
    expect(screen.getByText("e", { selector: ".text-orp" })).toBeInTheDocument();
  });
});
