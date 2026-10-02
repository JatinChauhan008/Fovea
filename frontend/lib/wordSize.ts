/**
 * The font size for the word on screen, as a CSS value.
 *
 * The red letter is pinned to the centre, so the longer side of it has to fit in
 * half the reading column (`--word-half-width`, set in globals.css). Short words
 * stay at the normal size (`--word-size`); long ones shrink just enough to fit.
 * CHAR_WIDTH_EM is a generous average letter width for the reading font, so the
 * estimate errs on the small side rather than clipping.
 */
const CHAR_WIDTH_EM = 0.62;

export function wordFontSize(before: string, after: string): string {
  // Half of the red letter itself sits on each side of the centre line.
  const longestSide = Math.max(before.length, after.length) + 0.5;
  const ems = Math.round(longestSide * CHAR_WIDTH_EM * 100) / 100;
  return `min(var(--word-size), calc(var(--word-half-width) / ${ems}))`;
}
