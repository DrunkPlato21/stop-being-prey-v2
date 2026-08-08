import { getAllArticles } from "./articles";

// Pulse feed for the Writer's Desk widget: site-only output (essays,
// issues, pinned site events; case files when they start publishing).
// Surfaces under the "Recent work" header on the widget and on
// /notes/activity in full.
//
// Two lanes were retired 2026-08-08:
//   - Field notes. The journal format was abandoned; the archive under
//     /notes/field-notes stays reachable (member comments and coins
//     live there) but nothing feeds the pulse from it.
//   - "Out in the world" social echo (admin-curated FB/X/YouTube).
//     Clay stopped curating it, and the desk had already retired the
//     section in July. The `field-note` source variant survives for
//     the glyph on old activity rows.
//
// Walls have their own Active Wall panel above this section. Admin-
// comment events are excluded entirely — they read as noise next to
// fresh work output.

export type PulseSource =
  | "essay"
  | "issue"
  | "field-note"
  | "case-file"
  | "guild";

export type PulseEvent = {
  source: PulseSource;
  at: number;
  /** Short label shown as the eyebrow on each pulse row, e.g.
      "New essay". Widget renders with uppercase tracked spacing. */
  label: string;
  /** Body / snippet displayed under the label. */
  body: string;
  /** Optional destination when the user taps the row. */
  link?: string;
};

const RECENT_WORK_DEFAULT_LIMIT = 3;

function parseDateMs(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/* === Site sources (essays + future case files) =================== */

function essayPulses(limit: number): PulseEvent[] {
  const articles = getAllArticles();
  const out: PulseEvent[] = [];
  for (const a of articles) {
    const at = parseDateMs(a.date);
    if (at === null) continue;
    const hasIssue = typeof a.issue === "number";
    out.push({
      source: hasIssue ? "issue" : "essay",
      at,
      label: hasIssue ? "New issue" : "New essay",
      body: a.title,
      link: `/${a.slug}`,
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

// Case files don't have a content source yet — the lane is placeholder
// architecture so members see the shape on launch day. When cases
// start publishing, wire a casefilePulses(limit) here and fold it into
// getRecentWorkEvents below.

/* === One-off pinned events ======================================= */

// Site-event entries — moments worth surfacing in the pulse stream
// that aren't tied to a new publication. Each is hand-coded with a
// fixed timestamp so it ages naturally ("3h ago" → "1d ago" → off
// the recent window) rather than re-firing on every page load.
//
// Add new entries at the top. When an event has aged past the
// widget's relevance window, leave it in this array — it stops
// surfacing organically once newer content pushes it out.
const PINNED_EVENTS: PulseEvent[] = [
  {
    source: "guild",
    at: Date.parse("2026-06-23T16:00:00Z"),
    label: "The Guild",
    body: "The deep room is open. Bring a real fight, or a real question.",
    link: "/guild",
  },
  {
    source: "case-file",
    at: Date.parse("2026-05-22T16:00:00Z"),
    label: "Case file",
    body: "Show Your Work. The Credentialed Dodge, then the Frame Reset.",
    link: "/case-files/006-show-your-work",
  },
  {
    source: "case-file",
    at: Date.parse("2026-05-15T16:00:00Z"),
    label: "Case file",
    body: "The Unworthy Business. Trish named it in the Lounge.",
    link: "/case-files/004-the-unworthy-business",
  },
  {
    source: "case-file",
    at: Date.parse("2026-05-14T16:00:00Z"),
    label: "Case files",
    body: "Three case files now in the archive.",
    link: "/case-files",
  },
  {
    source: "essay",
    at: Date.parse("2026-05-14T15:00:00Z"),
    label: "Founding texts",
    body: "Predator and Prey + We Pray For Our Prey now anchor the home page.",
    link: "/",
  },
];

/* === Lane aggregators ============================================ */

/**
 * Site-content pulse stream for the widget's "Recent Work" section.
 * Pulls each source with a generous per-lane window so a recent burst
 * on one lane doesn't shadow the others, then merges newest-first and
 * slices to `limit` (default 5).
 */
export async function getRecentWorkEvents({
  limit = RECENT_WORK_DEFAULT_LIMIT,
}: { limit?: number } = {}): Promise<PulseEvent[]> {
  const perLane = Math.max(2, Math.ceil(limit * 0.75));

  const essays = essayPulses(perLane);

  const events: PulseEvent[] = [...PINNED_EVENTS, ...essays];
  events.sort((a, b) => b.at - a.at);
  return events.slice(0, limit);
}


