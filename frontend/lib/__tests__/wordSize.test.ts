import { describe, expect, it } from "vitest";
import { wordFontSize } from "../wordSize";

describe("wordFontSize", () => {
  it("never grows past the reader's normal word size", () => {
    expect(wordFontSize("w", "ord")).toMatch(/^min\(var\(--word-size\), /);
  });

  it("sizes by the longer side of the highlighted letter, so both sides fit", () => {
    const short = wordFontSize("in", "ternationalization");
    const mirrored = wordFontSize("internationalizati", "on");

    expect(short).toBe(mirrored);
    expect(short).not.toBe(wordFontSize("w", "ord"));
  });

  it("gives longer words a smaller limit", () => {
    const limit = (css: string) => Number(/\/ ([\d.]+)\)\)$/.exec(css)?.[1]);

    expect(limit(wordFontSize("a", "bcdefghijklmnopqrstuvwxyz"))).toBeGreaterThan(
      limit(wordFontSize("a", "bcdef")),
    );
  });
});
