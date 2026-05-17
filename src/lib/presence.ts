import { Redis } from "@upstash/redis";
import { getProfile } from "./comments";

// Site-wide "where is every member right now" layer. Sibling to
// desk-visits.ts but broader in scope: desk-visits tracks the
// per-member last-opened-desk stamp that drives the NEW badges in
// the WritersDesk widget. presence tracks the *current location*
// of every signed-in non-admin member as they move around the site
// and powers /admin/presence.
//
// Redis schema:
//   presence:hash:<email>   HASH  { path, lastSeenAt }
//   presence:index          ZSET  score = lastSeenAt, member = email
//
// One hash entry per member (last-write-wins), one ranked index so
// "who was on the site in the last N minutes" is a cheap ZRANGE.

const HASH_PREFIX = "presence:hash:";
const INDEX_KEY = "presence:index";

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Record `email` as present at `path` as of `ms`. Called by the
 * /api/presence/ping endpoint from the root-layout beacon on every
 * mount + route change. No-op when Upstash isn't configured.
 */
export async function recordPresence(
  email: string,
  path: string,
  ms: number
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = normEmail(email);
  await Promise.all([
    client
      .hset(`${HASH_PREFIX}${norm}`, { path, lastSeenAt: ms })
      .catch(() => null),
    client
      .zadd(INDEX_KEY, { score: ms, member: norm })
      .catch(() => null),
  ]);
}

/* === Section taxonomy ========================================
   Buckets every URL into one of a small, human-readable set so the
   admin panel reads as "where's everyone" rather than "what URLs
   are people on." Order here is the display order on the panel. */

export type SectionId =
  | "desk"
  | "lounge"
  | "case-files"
  | "member-area"
  | "notifications"
  | "book"
  | "membership"
  | "reading"
  | "other";

export type Section = {
  id: SectionId;
  label: string;
};

export const SECTIONS: Section[] = [
  { id: "desk", label: "Writer's Desk" },
  { id: "lounge", label: "The Lounge" },
  { id: "case-files", label: "Case Files" },
  { id: "member-area", label: "Member area" },
  { id: "notifications", label: "Notifications" },
  { id: "book", label: "The Book" },
  { id: "membership", label: "Membership" },
  { id: "reading", label: "Reading" },
  { id: "other", label: "Elsewhere" },
];

const SECTION_BY_ID: Record<SectionId, Section> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s])
) as Record<SectionId, Section>;

/**
 * Bucket a pathname into a presence section. Longest-prefix-style
 * checks ordered by specificity. Single-segment slugs (e.g. /coin,
 * /predator-prey-frame) are essays and roll up into Reading.
 */
export function sectionForPath(path: string): Section {
  if (path === "/desk" || path.startsWith("/desk/")) {
    return SECTION_BY_ID.desk;
  }
  if (path === "/lounge" || path.startsWith("/lounge/")) {
    return SECTION_BY_ID.lounge;
  }
  if (path === "/case-files" || path.startsWith("/case-files/")) {
    return SECTION_BY_ID["case-files"];
  }
  if (path.startsWith("/notes/")) {
    return SECTION_BY_ID["member-area"];
  }
  if (path === "/notifications" || path.startsWith("/notifications/")) {
    return SECTION_BY_ID.notifications;
  }
  if (path === "/book" || path.startsWith("/book/")) {
    return SECTION_BY_ID.book;
  }
  if (path === "/membership" || path.startsWith("/membership/")) {
    return SECTION_BY_ID.membership;
  }
  const READING_EXACT = new Set([
    "/",
    "/about",
    "/coin",
    "/podcast",
    "/issues",
    "/join",
    "/tip",
    "/welcome",
  ]);
  if (READING_EXACT.has(path)) return SECTION_BY_ID.reading;
  if (
    path.startsWith("/founding/") ||
    path.startsWith("/walls/") ||
    path.startsWith("/comments/") ||
    path.startsWith("/tip/")
  ) {
    return SECTION_BY_ID.reading;
  }
  // Single-segment slug = essay page (e.g. /predator-prey-frame).
  if (/^\/[^/]+$/.test(path)) return SECTION_BY_ID.reading;
  return SECTION_BY_ID.other;
}

export type PresenceEntry = {
  email: string;
  /** Display name from the profile, or null when none is set. */
  displayName: string | null;
  /** Last path the member was on. */
  path: string;
  section: Section;
  lastSeenAt: number;
};

/**
 * Snapshot of every member who pinged at or after `sinceMs`, newest
 * first. Each entry carries the current path + a section bucket so
 * the panel can render both the count breakdown and the per-member
 * row without re-deriving anything client-side.
 */
export async function listPresenceSnapshot(
  sinceMs: number,
  now: number = Date.now()
): Promise<PresenceEntry[]> {
  const client = getClient();
  if (!client) return [];
  const raw = (await client
    .zrange(INDEX_KEY, sinceMs, now, {
      byScore: true,
      withScores: true,
    })
    .catch(() => [])) as Array<string | number>;
  const ranked: Array<{ email: string; lastSeenAt: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    const email = raw[i];
    const score = Number(raw[i + 1]);
    if (typeof email === "string" && Number.isFinite(score)) {
      ranked.push({ email, lastSeenAt: score });
    }
  }
  ranked.sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  const entries: PresenceEntry[] = [];
  for (const r of ranked) {
    const [hash, profile] = await Promise.all([
      client
        .hgetall<{ path?: string; lastSeenAt?: number | string }>(
          `${HASH_PREFIX}${r.email}`
        )
        .catch(() => null),
      getProfile(r.email).catch(() => null),
    ]);
    const path = (hash?.path && typeof hash.path === "string") ? hash.path : "/";
    const name = profile?.displayName?.trim();
    entries.push({
      email: r.email,
      displayName: name && name.length > 0 ? name : null,
      path,
      section: sectionForPath(path),
      lastSeenAt: r.lastSeenAt,
    });
  }
  return entries;
}

/** Roll a snapshot into a per-section count, ordered by SECTIONS. */
export function summarizeBySection(
  entries: PresenceEntry[]
): Array<{ section: Section; count: number }> {
  const counts = new Map<SectionId, number>();
  for (const e of entries) {
    counts.set(e.section.id, (counts.get(e.section.id) ?? 0) + 1);
  }
  return SECTIONS.map((section) => ({
    section,
    count: counts.get(section.id) ?? 0,
  }));
}
