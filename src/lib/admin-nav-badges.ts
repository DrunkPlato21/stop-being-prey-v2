import { Redis } from "@upstash/redis";
import { latestCommentActivityAt } from "./comments";

// Per-admin "is there something new since you last looked?" flags
// driving the small olive dots next to nav items in AdminPersistentNav.
// Single-admin site — one set of last-seen timestamps keyed by section.
//
// Redis schema:
//   admin:nav-seen:<section>   STRING ms timestamp (last time Clay
//                              opened that section's admin page)
//
// "There's something new" is true when the most recent item in that
// section's existing index has a higher timestamp than the seen mark.
// Latest-item lookup reuses the indexes the section already maintains
// (comments:activity, lounge:posts, case-submissions, pool:requests:all),
// so this layer adds 1 MGET + 4 ZRANGE calls per admin page render — cheap.
//
// Comments read comments:activity, not comments:all. comments:all is
// scored by the comment's own createdAt and holds no entry at all for a
// thread reply, so the dot stayed dark for every reply ever posted: a
// dark dot did not mean "nothing new". comments:activity carries one
// entry per comment AND per reply, scored by when it happened.

const SEEN_PREFIX = "admin:nav-seen:";

export const NAV_SECTIONS = [
  "comments",
  "lounge",
  "case-submissions",
  "pool",
] as const;
export type NavBadgeSection = (typeof NAV_SECTIONS)[number];

export type AdminNavBadges = Record<NavBadgeSection, boolean>;

const EMPTY_BADGES: AdminNavBadges = {
  comments: false,
  lounge: false,
  "case-submissions": false,
  pool: false,
};

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function seenKey(section: NavBadgeSection): string {
  return `${SEEN_PREFIX}${section}`;
}

function indexKeyFor(section: Exclude<NavBadgeSection, "comments">): string {
  if (section === "lounge") return "lounge:posts";
  if (section === "pool") return "pool:requests:all";
  return "case-submissions";
}

async function latestScore(
  client: Redis,
  section: NavBadgeSection
): Promise<number> {
  // Comments are the one section whose "newest thing" is not the top of
  // a ZSET this module owns — see the note above.
  if (section === "comments") {
    return latestCommentActivityAt().catch(() => 0);
  }
  const result = (await client
    .zrange(indexKeyFor(section), 0, 0, { rev: true, withScores: true })
    .catch(() => [] as unknown[])) as Array<string | number>;
  if (Array.isArray(result) && result.length >= 2) {
    const score = Number(result[1]);
    return Number.isFinite(score) ? score : 0;
  }
  return 0;
}

/**
 * Returns whether each section has unread activity for the admin.
 * Cheap: 1 MGET for the seen marks + 4 ZRANGEs (limit 1) for latest
 * timestamps. Total ~5 Redis commands per call.
 */
export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  const client = getClient();
  if (!client) return { ...EMPTY_BADGES };

  const seenRaw = (await client
    .mget<(string | number | null)[]>(...NAV_SECTIONS.map(seenKey))
    .catch(() => [] as (string | number | null)[])) ?? [];

  const latests = await Promise.all(
    NAV_SECTIONS.map((s) => latestScore(client, s))
  );

  const out: AdminNavBadges = { ...EMPTY_BADGES };
  NAV_SECTIONS.forEach((section, i) => {
    // Upstash auto-deserializes numeric strings, so a value SET as
    // String(Date.now()) comes back as a JS number. Handle both shapes
    // — the older string-only branch silently returned 0 here, which
    // meant `latests > 0` was always true and the dot never cleared.
    const raw = seenRaw[i];
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : 0;
    const seenAt = Number.isFinite(n) ? n : 0;
    out[section] = latests[i] > seenAt;
  });
  return out;
}

/**
 * The section's last-seen stamp (epoch ms, 0 if never). Read BEFORE
 * markSectionSeen on the section's page so per-item NEW markers compare
 * against the previous visit rather than against this one.
 */
export async function getSectionSeen(
  section: NavBadgeSection
): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const raw = await client
    .get<string | number>(seenKey(section))
    .catch(() => null);
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Bump the seen marker for a section. Called from the admin page that
 * owns that section so a visit clears its dot on the next render
 * (server components re-fetch the layout's data per request).
 */
export async function markSectionSeen(
  section: NavBadgeSection
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(seenKey(section), String(Date.now())).catch(() => null);
}
