import { getAllArticles } from "./articles";
import { getAllFieldNotes } from "./field-notes";
import {
  listChannelPosts,
  type ChannelPost,
} from "./channel-posts";

// Pulse feeds for the Writer's Desk widget. Two distinct lanes so
// social posts can't crowd out site work:
//
//   At home          — site-only output. Essays, field notes, issues,
//                       and (once they start publishing) case files.
//                       Surfaces under the "At home" header on the
//                       widget and on /notes/activity in full.
//   Out in the world — social-only output. Admin-curated entries from
//                       the channels:x and channels:fb Upstash lists.
//                       Surfaces under the "Out in the world" header
//                       on the widget and on /notes/elsewhere in full.
//
// Walls have their own Active Wall panel above this section. Admin-
// comment events are excluded entirely — they read as noise next to
// fresh work output.
//
// The two lanes share the PulseEvent shape and the row component on
// the widget, so source glyphs and NEW-badge logic work identically
// across both. Each lane caps independently and never reaches into
// the other's sources.

export type PulseSource =
  | "essay"
  | "issue"
  | "field-note"
  | "case-file"
  | "facebook"
  | "x";

export type PulseEvent = {
  source: PulseSource;
  at: number;
  /** Short label shown as the eyebrow on each pulse row, e.g.
      "On Facebook". Widget renders with uppercase tracked spacing. */
  label: string;
  /** Body / snippet displayed under the label. */
  body: string;
  /** Optional destination when the user taps the row. */
  link?: string;
};

const RECENT_WORK_DEFAULT_LIMIT = 3;
const ELSEWHERE_DEFAULT_LIMIT = 3;

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

/* === Site sources (essays + field notes + future case files) ====== */

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

function fieldNotePulses(limit: number): PulseEvent[] {
  const notes = getAllFieldNotes();
  const out: PulseEvent[] = [];
  for (const n of notes) {
    const at = parseDateMs(n.date);
    if (at === null) continue;
    out.push({
      source: "field-note",
      at,
      label: "Field note",
      body: n.title,
      link: `/notes/field-notes/${n.slug}`,
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

/* === Social sources (admin-curated, Upstash) ====================== */

function channelPostToEvent(post: ChannelPost): PulseEvent {
  return {
    source: post.source === "fb" ? "facebook" : "x",
    at: post.postedAt,
    label: post.source === "fb" ? "On Facebook" : "On X",
    body: post.text,
    link: post.url,
  };
}

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
  const fieldNotes = fieldNotePulses(perLane);

  const events: PulseEvent[] = [...PINNED_EVENTS, ...essays, ...fieldNotes];
  events.sort((a, b) => b.at - a.at);
  return events.slice(0, limit);
}

/**
 * Social-channel pulse stream for the widget's "Elsewhere" section.
 * Reads admin-curated entries from channels:fb and channels:x in
 * Upstash, merges newest-first, slices to `limit` (default 3).
 */
export async function getElsewhereEvents({
  limit = ELSEWHERE_DEFAULT_LIMIT,
}: { limit?: number } = {}): Promise<PulseEvent[]> {
  const perLane = Math.max(2, Math.ceil(limit * 0.75));

  const [fbPosts, xPosts] = await Promise.all([
    listChannelPosts({ source: "fb", limit: perLane }),
    listChannelPosts({ source: "x", limit: perLane }),
  ]);

  const events: PulseEvent[] = [
    ...fbPosts.map(channelPostToEvent),
    ...xPosts.map(channelPostToEvent),
  ];
  events.sort((a, b) => b.at - a.at);
  return events.slice(0, limit);
}
