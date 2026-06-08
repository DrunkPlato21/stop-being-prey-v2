// Splits rendered article HTML so one inline call-to-action (the email
// form) can sit at an *opportune* mid-body break, instead of only at the
// very bottom where most readers never land.
//
// Placement priority, nearest the ~58% reading mark and clamped to the
// 42-72% band so it never crowds the masthead or footer asks:
//   1. A thematic break (<hr>, from a `---` scene break). The form takes
//      that rule's place, so there's no redundant divider-then-form.
//   2. A section heading (<h2>/<h3>). The form sits just before it, so the
//      reader returns to a fresh section right after.
//   3. Fallback: a clean paragraph-to-paragraph seam, so the form is never
//      jammed into the middle of a thought.
//
// Returns null for short pieces (the masthead + footer asks already cover
// those) and for anything with too few paragraphs to split cleanly.
//
// Eligibility lives with the caller. Standard articles opt in; essayStyle
// pieces opt out, because their positional pull-quote CSS is evaluated per
// container and a split would disturb the ornaments.

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

// A candidate cut: `cut` is where `before` ends; `afterStart` is where
// `after` begins (they differ only when an element between them — an <hr>
// — is consumed). `ratio` is how far through the visible text the cut sits.
type Candidate = { cut: number; afterStart: number; ratio: number };

function nearestToTarget(cands: Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const c of cands) {
    if (
      !best ||
      Math.abs(c.ratio - TARGET_RATIO) < Math.abs(best.ratio - TARGET_RATIO)
    ) {
      best = c;
    }
  }
  return best;
}

export function splitForInlineCta(
  html: string
): { before: string; after: string } | null {
  // Author override: a {{CTA}} marker placed in the markdown wins over
  // auto-placement and bypasses the length guards. It renders as
  // <p>{{CTA}}</p>; split exactly there and drop the marker. Use this on
  // pieces where the auto-placer lands badly (e.g. mid-exchange in a
  // dialogue) — you know where the real breath is, the algorithm doesn't.
  const marker = html.match(/<p>\s*\{\{\s*CTA\s*\}\}\s*<\/p>/i);
  if (marker && marker.index !== undefined) {
    return {
      before: html.slice(0, marker.index).trimEnd(),
      after: html.slice(marker.index + marker[0].length).trimStart(),
    };
  }

  const paragraphCount = (html.match(/<p[\s>]/gi) || []).length;
  if (paragraphCount < MIN_PARAGRAPHS) return null;

  const total = visibleLength(html);
  if (total < MIN_VISIBLE_CHARS) return null;

  const ratioAt = (index: number) =>
    visibleLength(html.slice(0, index)) / total;
  const inBand = (r: number) => r >= MIN_RATIO && r <= MAX_RATIO;

  // 1 + 2: structural breaks (thematic rules and section headings).
  const structural: Candidate[] = [];

  // <hr>: the form replaces the rule, so afterStart skips past it.
  for (const m of html.matchAll(/<hr\b[^>]*>/gi)) {
    if (m.index === undefined) continue;
    const ratio = ratioAt(m.index);
    if (inBand(ratio)) {
      structural.push({
        cut: m.index,
        afterStart: m.index + m[0].length,
        ratio,
      });
    }
  }
  // <h2>/<h3>: the form sits before the heading, which is kept intact.
  for (const m of html.matchAll(/<h[23]\b[^>]*>/gi)) {
    if (m.index === undefined) continue;
    const ratio = ratioAt(m.index);
    if (inBand(ratio)) {
      structural.push({ cut: m.index, afterStart: m.index, ratio });
    }
  }

  let chosen = nearestToTarget(structural);

  // 3: fallback — nearest clean paragraph-to-paragraph seam.
  if (!chosen) {
    const seams: Candidate[] = [];
    for (const m of html.matchAll(/<\/p>\s*(?=<p[\s>])/gi)) {
      if (m.index === undefined) continue;
      const cut = m.index + m[0].length;
      const ratio = ratioAt(cut);
      if (inBand(ratio)) seams.push({ cut, afterStart: cut, ratio });
    }
    chosen = nearestToTarget(seams);
  }

  if (!chosen) return null;
  return {
    before: html.slice(0, chosen.cut).trimEnd(),
    after: html.slice(chosen.afterStart).trimStart(),
  };
}
