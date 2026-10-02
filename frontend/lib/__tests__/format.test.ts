import { describe, expect, it } from "vitest";
import { formatDuration } from "../format";

describe("formatDuration", () => {
  it("shows minutes under an hour, rounded to the nearest minute", () => {
    expect(formatDuration(44.6)).toBe("45 min");
  });

  it("never shows less than a minute", () => {
    expect(formatDuration(0.2)).toBe("1 min");
  });

  it("shows whole hours without minutes", () => {
    expect(formatDuration(120)).toBe("2 h");
  });

  it("shows hours and minutes", () => {
    expect(formatDuration(125)).toBe("2 h 5 min");
  });
});
