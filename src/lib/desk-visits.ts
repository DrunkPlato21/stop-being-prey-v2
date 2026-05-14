import { Redis } from "@upstash/redis";
import { getProfile } from "./comments";

// Per-member "last time you opened the Writer's Desk" stamp. Drives
// the NEW badges on the widget — anything newer than this stamp is
// fresh to the viewer.
//
// A second key holds a sorted-set index over all members ever stamped,
// scored by visit time. This lets the admin panel ask "who opened the
// desk in the last N minutes?" without scanning the keyspace.
//
// Redis schema:
//   desk:last-visited:<email>   number (epoch ms)
//   desk:visits-index           ZSET, score=lastVisitedAt, member=email

const KEY_PREFIX = "desk:last-visited:";
const VISITS_INDEX = "desk:visits-index";

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
 * Read the viewer's last-visited stamp. Returns null when the member
 * has never opened the widget (first-time visit) or when storage
 * isn't configured.
 */
export async function getLastVisited(
  email: string
): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client
    .get<number | string>(`${KEY_PREFIX}${normEmail(email)}`)
    .catch(() => null);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Write the viewer's last-visited stamp. Called explicitly by the
 * client a few seconds after the widget mounts so the polling loop
 * doesn't auto-clear the NEW badges mid-session. Also bumps the
 * sorted-set index so admin "who's been here recently" lookups stay
 * cheap.
 */
export async function setLastVisited(
  email: string,
  ms: number
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = normEmail(email);
  await Promise.all([
    client.set(`${KEY_PREFIX}${norm}`, ms).catch(() => null),
    client
      .zadd(VISITS_INDEX, { score: ms, member: norm })
      .catch(() => null),
  ]);
}

export type RecentVisitor = {
  email: string;
  lastVisitedAt: number;
};

/**
 * Visitors whose last-visited stamp is at or after `sinceMs`. Newest
 * first. Returns an empty array when storage isn't configured or no
 * visits qualify.
 */
export async function listRecentVisitors(
  sinceMs: number,
  now: number = Date.now()
): Promise<RecentVisitor[]> {
  const client = getClient();
  if (!client) return [];
  // zrange by score with withScores returns a flat [member, score, ...]
  // list. Upstash types it loosely so we narrow at the boundary.
  const raw = (await client
    .zrange(VISITS_INDEX, sinceMs, now, {
      byScore: true,
      withScores: true,
    })
    .catch(() => [])) as Array<string | number>;
  const out: RecentVisitor[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const email = raw[i];
    const score = Number(raw[i + 1]);
    if (typeof email === "string" && Number.isFinite(score)) {
      out.push({ email, lastVisitedAt: score });
    }
  }
  out.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
  return out;
}

export type RecentVisitorEnriched = {
  email: string;
  /** Display name from the profile, or null if none set. Caller
      should fall back to email's local-part for rendering. */
  displayName: string | null;
  lastVisitedAt: number;
};

export type RecentVisitorsPage = {
  visitors: RecentVisitorEnriched[];
  /** Total in the window before any limit was applied. Lets the UI
      render a "+N more" footer when truncated. */
  totalCount: number;
};

/**
 * Newest-first visitors enriched with each member's current display
 * name, capped to `limit` (default 20). When the raw window contains
 * more than `limit` visitors, `totalCount` exceeds `visitors.length`
 * and the caller can render a "+N more" affordance.
 */
export async function listRecentVisitorsEnriched(
  sinceMs: number,
  opts?: { limit?: number; now?: number }
): Promise<RecentVisitorsPage> {
  const now = opts?.now ?? Date.now();
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const raw = await listRecentVisitors(sinceMs, now);
  const totalCount = raw.length;
  const slice = raw.slice(0, limit);

  // Profile fetches are sequential here for simplicity. At <100
  // entries per call (clamped above) this is well under any
  // reasonable budget. Promise.all would shave latency, but the
  // popover is admin-only and runs on demand — no need to optimize.
  const enriched: RecentVisitorEnriched[] = [];
  for (const v of slice) {
    const profile = await getProfile(v.email).catch(() => null);
    const name = profile?.displayName?.trim();
    enriched.push({
      email: v.email,
      displayName: name && name.length > 0 ? name : null,
      lastVisitedAt: v.lastVisitedAt,
    });
  }

  return { visitors: enriched, totalCount };
}
