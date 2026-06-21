import fs from "fs";
import path from "path";
import matter from "gray-matter";

// Case Files content pipeline. Mirrors the Field Notes lib in shape
// (gray-matter frontmatter, slug-from-filename, archive-sortable
// metadata) but uses STRUCTURED frontmatter rather than free-form
// markdown for the body sections.
//
// Why structured: each case file follows a fixed template (Situation
// → Move → Trap → Frame Shift → One-Shot → Rules Applied → Outcome)
// and the One-Shot specifically needs its own visual treatment (the
// bordered callout). Storing each section as its own frontmatter
// field is cleaner than parsing markdown headings out, and Rules
// Applied is data — number references that the rules page reads back
// to surface "case files demonstrating this rule."
//
// Body sections support paragraph breaks via blank lines (split on
// /\n\s*\n/ at read time). No markdown rendering needed — the prose
// is plain.

const CASE_FILES_DIR = path.join(process.cwd(), "content", "case-files");

// Roman numerals for the seven rules. Lookup by rule.number - 1.
// Matches the ROMAN array in the rules page so the two surfaces
// agree on numeral style.
export const RULE_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// Short labels for each rule, used in the "Rules Applied" line on
// case file detail pages and on the rules-applied chip row in the
// archive cards. Mirrors the spec's truncated phrasing — readers
// recognize the rule from the short label, and the linked anchor
// takes them to the full body. Kept here (not in the rules page)
// so case files and the rules page can both import a single source
// of truth.
export const RULE_SHORT_LABEL: Record<number, string> = {
  1: "Refuse their traps",
  2: "Make them come to you",
  3: "The audience is the prize",
  4: "Name the move",
  5: "Silence is a verdict",
  6: "Devastate, then grace",
  7: "Hostility feeds you",
};

export type CaseFile = {
  slug: string;
  title: string;
  number: number;
  date: string;
  archetype: string;
  platform: string;
  situation: string[];
  move: string[];
  trap: string[];
  frameShift: string[];
  /** The deployable line. Rendered as the bordered callout. */
  oneShot: string;
  /** Numeric rule references (1..8). Drives both the in-page Rules
      Applied block and the reverse lookup on the rules page. */
  rulesApplied: number[];
  /** Optional single-line outcome ("went silent," "doubled down,"
      etc.). When null, the OUTCOME section is omitted. */
  outcome: string | null;
  /** Visual evidence of the exchange. All three fields move together
      — when src is null, the screenshot block is omitted entirely.
      `transcript` optionally carries the plain-text content of the
      image for a <details>-based collapsible "read the text" beneath
      the caption. */
  screenshot: {
    src: string;
    alt: string;
    caption: string;
    transcript: string | null;
  } | null;
  /** Direct link to the live post on the original platform. Renders
      as a small olive "see the live post →" link beneath the caption.
      Null for anonymized cases or when the post is no longer
      reachable (account deleted, etc.). */
  livePostUrl: string | null;
  /** Optional second screenshot, positioned under THE FRAME SHIFT.
      Used by case files about a downstream payoff (a wall, a donor
      response, an audience reaction) — the artifact is the writer's
      surface, not the critic's comment. Has the same shape as
      `screenshot` plus an optional link to the live surface. */
  wallScreenshot: {
    src: string;
    alt: string;
    caption: string;
    liveUrl: string | null;
    transcript: string | null;
  } | null;
  /** Optional EXHIBIT block. Renders between THE FRAME SHIFT (or its
      wall screenshot, if present) and THE ONE-SHOT. Used when a
      member message / donor quote / external reaction is itself the
      doctrine payoff. The quote sits in a styled callout, framed by
      an intro paragraph above and a framing paragraph below. */
  exhibit: {
    /** Setup paragraph above the callout. Optional. */
    intro: string;
    /** The quote text itself. Goes inside the callout. */
    quote: string;
    /** Source name (e.g. "Jonathan Bonde"). */
    attributionName: string;
    /** Optional dollar amount displayed inline with the name. */
    attributionAmount: string | null;
    /** Optional date displayed right-aligned on the attribution row. */
    attributionDate: string | null;
    /** Framing paragraph below the callout. Optional. */
    framing: string;
  } | null;
  /** Slug of a predecessor case file. When set, the detail page
      renders a breadcrumb at the top ("← Round one in Case File №N: …")
      and the predecessor's page renders a forward continuation link
      ("Continued in Case File №M: … →") — the reverse direction is
      derived at render time by scanning all case files. */
  continuesFrom: string | null;
  /** When true, this case file is reachable to unauthenticated
      visitors as a marketing/email funnel surface. The case-files
      layout swaps the member nav for a preview clone (links point at
      /membership), the detail page adds a "Join the founders" CTA,
      and SEO opens up to indexable. proxy.ts also reads this list
      via a hardcoded slug allowlist (kept in sync manually). */
  publicPreview: boolean;
};

function splitParagraphs(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function coerceDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function readOne(slug: string): CaseFile | null {
  const file = path.join(CASE_FILES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { data } = matter(raw);
  if (typeof data.title !== "string") return null;
  return {
    slug,
    title: data.title,
    number: typeof data.number === "number" ? data.number : 0,
    date: coerceDate(data.date),
    archetype: typeof data.archetype === "string" ? data.archetype : "",
    platform: typeof data.platform === "string" ? data.platform : "",
    situation: splitParagraphs(data.situation),
    move: splitParagraphs(data.move),
    trap: splitParagraphs(data.trap),
    frameShift: splitParagraphs(data.frame_shift),
    oneShot: typeof data.one_shot === "string" ? data.one_shot.trim() : "",
    rulesApplied: Array.isArray(data.rules_applied)
      ? data.rules_applied.filter(
          (n: unknown): n is number => typeof n === "number"
        )
      : [],
    outcome:
      typeof data.outcome === "string" && data.outcome.trim().length > 0
        ? data.outcome.trim()
        : null,
    screenshot:
      typeof data.screenshot_src === "string" &&
      data.screenshot_src.trim().length > 0
        ? {
            src: data.screenshot_src.trim(),
            alt:
              typeof data.screenshot_alt === "string"
                ? data.screenshot_alt.trim()
                : "",
            caption:
              typeof data.screenshot_caption === "string"
                ? data.screenshot_caption.trim()
                : "",
            transcript:
              typeof data.screenshot_transcript === "string" &&
              data.screenshot_transcript.trim().length > 0
                ? data.screenshot_transcript
                : null,
          }
        : null,
    livePostUrl:
      typeof data.live_post_url === "string" &&
      data.live_post_url.trim().length > 0
        ? data.live_post_url.trim()
        : null,
    wallScreenshot:
      typeof data.wall_screenshot_src === "string" &&
      data.wall_screenshot_src.trim().length > 0
        ? {
            src: data.wall_screenshot_src.trim(),
            alt:
              typeof data.wall_screenshot_alt === "string"
                ? data.wall_screenshot_alt.trim()
                : "",
            caption:
              typeof data.wall_screenshot_caption === "string"
                ? data.wall_screenshot_caption.trim()
                : "",
            liveUrl:
              typeof data.wall_url === "string" &&
              data.wall_url.trim().length > 0
                ? data.wall_url.trim()
                : null,
            transcript:
              typeof data.wall_screenshot_transcript === "string" &&
              data.wall_screenshot_transcript.trim().length > 0
                ? data.wall_screenshot_transcript
                : null,
          }
        : null,
    exhibit: parseExhibit(data.exhibit),
    continuesFrom:
      typeof data.continues_from === "string" &&
      data.continues_from.trim().length > 0
        ? data.continues_from.trim()
        : null,
    publicPreview: data.public_preview === true,
  };
}

// Exhibit frontmatter is a nested map. Defensive parse — every leaf
// is optional so a malformed entry doesn't poison the whole record.
// Returns null when the whole block is missing or has no quote
// (since the quote is the only field that can't be sensibly empty).
function parseExhibit(value: unknown): CaseFile["exhibit"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const quote = typeof data.quote === "string" ? data.quote.trim() : "";
  if (!quote) return null;
  return {
    intro: typeof data.intro === "string" ? data.intro.trim() : "",
    quote,
    attributionName:
      typeof data.attribution_name === "string"
        ? data.attribution_name.trim()
        : "",
    attributionAmount:
      typeof data.attribution_amount === "string" &&
      data.attribution_amount.trim().length > 0
        ? data.attribution_amount.trim()
        : null,
    attributionDate:
      typeof data.attribution_date === "string" &&
      data.attribution_date.trim().length > 0
        ? data.attribution_date.trim()
        : null,
    framing: typeof data.framing === "string" ? data.framing.trim() : "",
  };
}

export function getAllCaseFileSlugs(): string[] {
  if (!fs.existsSync(CASE_FILES_DIR)) return [];
  return fs
    .readdirSync(CASE_FILES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * All case files, sorted highest-number-first. Sorting by the case
 * file's `number` (rather than date) keeps the index list's order
 * aligned with the visible "Case File №N" label on each row — readers
 * see N, N-1, N-2... walking down the page, which is the only sort
 * that reads predictably when numbers are narrative identifiers
 * decoupled from publication date. The archive shelf renders in this
 * order; "next case file" navigation steps backward through the same
 * sequence.
 */
export function getAllCaseFiles(): CaseFile[] {
  const slugs = getAllCaseFileSlugs();
  const files: CaseFile[] = [];
  for (const slug of slugs) {
    const cf = readOne(slug);
    if (cf) files.push(cf);
  }
  return files.sort((a, b) => b.number - a.number);
}

export function getCaseFileBySlug(slug: string): CaseFile | null {
  return readOne(slug);
}

/**
 * Case files marked `public_preview: true` — reachable to logged-out
 * visitors as funnel surfaces. Highest-number-first (inherits the
 * getAllCaseFiles sort). Used by the Rules unlock bridge to show a
 * just-converted reader the doctrine drilled against a live kill.
 */
export function getPublicCaseFiles(): CaseFile[] {
  return getAllCaseFiles().filter((cf) => cf.publicPreview);
}

/**
 * Reverse of `continuesFrom`. Given a case file slug, find the case
 * file that points back at it (if any). Used to render the "Continued
 * in Case File №N: … →" forward link on the predecessor's detail
 * page — the predecessor doesn't carry the link in its own
 * frontmatter, so it gets discovered by scanning all case files.
 */
export function findSuccessor(slug: string): CaseFile | null {
  for (const cf of getAllCaseFiles()) {
    if (cf.continuesFrom === slug) return cf;
  }
  return null;
}

/**
 * "12-word teaser" — used in the archive card to give a preview of
 * the One-Shot without revealing the full deployable line. Trims to
 * a clean word boundary and appends an ellipsis when truncated.
 */
export function teaseOneShot(oneShot: string, words = 12): string {
  const tokens = oneShot.replace(/[“”"]/g, "").split(/\s+/);
  if (tokens.length <= words) return oneShot.replace(/[“”"]/g, "");
  return tokens.slice(0, words).join(" ") + "...";
}
