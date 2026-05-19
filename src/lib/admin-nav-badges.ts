import { Redis } from "@upstash/redis";

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
// (comments:all, lounge:posts, case-submissions), so this layer adds
// 1 MGET + 3 ZRANGE calls per admin page render — cheap.

const SEEN_PREFIX = "admin:nav-seen:";

export const NAV_SECTIONS = ["comments", "lounge", "case-submissions"] as const;
export type NavBadgeSection = (typeof NAV_SECTIONS)[number];

export type AdminNavBadges = Record<NavBadgeSection, boolean>;

const EMPTY_BADGES: AdminNavBadges = {
  comments: false,
  lounge: false,
  "case-submissions": false,
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

function indexKeyFor(section: NavBadgeSection): string {
  if (section === "comments") return "comments:all";
  if (section === "lounge") return "lounge:posts";
  return "case-submissions";
}

async function latestScore(
  client: Redis,
  section: NavBadgeSection
): Promise<number> {
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
 * Cheap: 1 MGET for the seen marks + 3 ZRANGEs (limit 1) for latest
 * timestamps. Total ~4 Redis commands per call.
 */
export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  const client = getClient();
  if (!client) return { ...EMPTY_BADGES };

  const seenRaw = (await client
    .mget<(string | null)[]>(...NAV_SECTIONS.map(seenKey))
    .catch(() => [] as (string | null)[])) ?? [];

  const latests = await Promise.all(
    NAV_SECTIONS.map((s) => latestScore(client, s))
  );

  const out: AdminNavBadges = { ...EMPTY_BADGES };
  NAV_SECTIONS.forEach((section, i) => {
    const seenStr = seenRaw[i];
    const seenAt =
      typeof seenStr === "string"
        ? Number.parseInt(seenStr, 10) || 0
        : 0;
    out[section] = latests[i] > seenAt;
  });
  return out;
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
