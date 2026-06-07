// Splits rendered article HTML at a paragraph boundary near the reading
// midpoint so one inline call-to-action (the email form) can sit where
// attention is still high, instead of only at the very bottom where most
// readers never land.
//
// Conservative by design:
//   - Only cuts between two adjacent top-level <p> paragraphs, so the
//     form never lands next to a heading, list, blockquote, or figure.
//   - Targets ~58% through the *visible* text (tags stripped), clamped to
//     the 42-72% band so it's never crowding the masthead or the footer
//     asks.
//   - Returns null for short pieces (the masthead + footer asks already
//     cover those) and for anything with too few paragraphs to split
//     cleanly.
//
// Eligibility lives with the caller. Standard articles opt in; essayStyle
// pieces opt out, because their positional pull-quote CSS
// (figure.ea-pullquote:first-of-type / :last-child / :nth-last-child(2))
// is evaluated per container and a split would disturb the ornaments.

const MIN_PARAGRAPHS = 6;
const MIN_VISIBLE_CHARS = 1800; // ~300+ words of body
const TARGET_RATIO = 0.58;
const MIN_RATIO = 0.42;
const MAX_RATIO = 0.72;

function visibleLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function splitForInlineCta(
  html: string
): { before: string; after: string } | null {
  const paragraphCount = (html.match(/<p[\s>]/gi) || []).length;
  if (paragraphCount < MIN_PARAGRAPHS) return null;

  const total = visibleLength(html);
  if (total < MIN_VISIBLE_CHARS) return null;

  // Candidate cut points: the start of a <p> that immediately follows a
  // </p> (a clean paragraph-to-paragraph seam). The trailing \s* is
  // consumed; the lookahead leaves the next <p> in place, so the match
  // end is exactly the index of that <p>.
  const seam = /<\/p>\s*(?=<p[\s>])/gi;
  let best: { index: number; dist: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = seam.exec(html)) !== null) {
    const index = m.index + m[0].length;
    const ratio = visibleLength(html.slice(0, index)) / total;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
    const dist = Math.abs(ratio - TARGET_RATIO);
    if (!best || dist < best.dist) best = { index, dist };
  }

  if (!best) return null;
  return {
    before: html.slice(0, best.index),
    after: html.slice(best.index),
  };
}
