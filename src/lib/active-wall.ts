import { Redis } from "@upstash/redis";
import { getAllWalls, type WallMeta } from "./walls";
import { listApprovedByWall } from "./wallDonations";

// Snapshot of the wall the Writer's Desk widget should feature in its
// Active Wall panel.
//
// The admin /admin/desk panel can override the feed two ways:
//   - Toggle enabled=false: panel hides entirely.
//   - Set featuredSlug to a specific wall: that wall is featured
//     regardless of status. The admin pastes a wall URL (or slug);
//     the slug is extracted on write so the override is canonical.
//
// When enabled=true and featuredSlug is empty, falls back to the
// historical auto-selection rules:
//   1. Most recent active wall.
//   2. If none active, the most recently closed wall whose last
//      activity was within the last 7 days.
//   3. Otherwise null (panel hides).
//
// Redis schema:
//   desk:wall_override   JSON WallOverride. Absent = defaults (enabled, no slug).

const WALL_OVERRIDE_KEY = "desk:wall_override";

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export type WallOverride = {
  enabled: boolean;
  /** Slug of the wall to feature. Empty string means "auto-select". */
  featuredSlug: string;
};

const DEFAULT_OVERRIDE: WallOverride = {
  enabled: true,
  featuredSlug: "",
};

function parseOverride(raw: unknown): WallOverride {
  if (raw === null || raw === undefined) return DEFAULT_OVERRIDE;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<WallOverride>)
        : (raw as Partial<WallOverride>);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      featuredSlug:
        typeof parsed.featuredSlug === "string" ? parsed.featuredSlug : "",
    };
  } catch {
    return DEFAULT_OVERRIDE;
  }
}

export async function getWallOverride(): Promise<WallOverride> {
  const client = getClient();
  if (!client) return DEFAULT_OVERRIDE;
  const raw = await client.get<string>(WALL_OVERRIDE_KEY);
  return parseOverride(raw);
}

export async function setWallOverride(
  next: Partial<WallOverride>
): Promise<WallOverride> {
  const client = getClient();
  const current = await getWallOverride();
  const merged: WallOverride = {
    enabled:
      typeof next.enabled === "boolean" ? next.enabled : current.enabled,
    featuredSlug:
      typeof next.featuredSlug === "string"
        ? next.featuredSlug
        : current.featuredSlug,
  };
  if (client) {
    await client.set(WALL_OVERRIDE_KEY, JSON.stringify(merged));
  }
  return merged;
}

/**
 * Parse a pasted wall reference into a canonical slug. Accepts any of:
 *   https://stopbeingprey.com/walls/marek-takedown
 *   /walls/marek-takedown
 *   walls/marek-takedown
 *   marek-takedown
 * Strips trailing slashes and query strings. Returns "" for empty input.
 */
export function extractWallSlug(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/\/walls\/([^/?#\s]+)/i);
  if (m) return m[1];
  return trimmed
    .replace(/^\/+/, "")
    .replace(/^walls\//i, "")
    .replace(/[/?#].*$/, "");
}

export type ActiveWallSnapshot = {
  slug: string;
  title: string;
  description: string | null;
  totalRaisedCents: number;
  contributorCount: number;
  status: "active" | "closed";
  /** Display-ready label like "Active · 3 days" or "Closed · 4 days ago". */
  daysLabel: string;
  /** Epoch ms the wall opened. Powers the "NEW since last visit"
      badge on the widget. Falls back to earliest donation when no
      explicit `startedAt` is set in frontmatter. */
  openedAt: number | null;
  url: string;
  /** Count of *other* active walls so the panel can flash a discreet
      "+ N more" link when Clay's running concurrent walls. */
  otherActiveCount: number;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_CLOSED_WINDOW_MS = 7 * ONE_DAY_MS;

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : trimmed).trim();
}

function pickDescription(wall: WallMeta): string | null {
  if (wall.description) return wall.description;
  if (wall.intro) {
    const sentence = firstSentence(wall.intro);
    if (sentence) return sentence;
  }
  return null;
}

function daysBetween(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  return Math.floor((toMs - fromMs) / ONE_DAY_MS);
}

function activeLabel(days: number): string {
  if (days <= 0) return "Active · today";
  if (days === 1) return "Active · 1 day";
  return `Active · ${days} days`;
}

function closedLabel(days: number): string {
  if (days <= 0) return "Closed · today";
  if (days === 1) return "Closed · yesterday";
  return `Closed · ${days} days ago`;
}

function isoToMs(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

async function statsAndTimestamps(wall: WallMeta) {
  const approved = await listApprovedByWall(wall.slug);
  let totalRaisedCents = 0;
  let earliest = Number.POSITIVE_INFINITY;
  let latest = 0;
  for (const d of approved) {
    totalRaisedCents += d.amountCents;
    if (d.timestamp < earliest) earliest = d.timestamp;
    if (d.timestamp > latest) latest = d.timestamp;
  }
  return {
    totalRaisedCents,
    contributorCount: approved.length,
    earliestDonationAt: Number.isFinite(earliest) ? earliest : null,
    latestDonationAt: latest > 0 ? latest : null,
  };
}

async function buildSnapshot(
  wall: WallMeta,
  otherActiveCount: number,
  now: number
): Promise<ActiveWallSnapshot> {
  const stats = await statsAndTimestamps(wall);
  let daysLabel: string;
  let openedAt: number | null;
  if (wall.status === "active") {
    const startMs =
      isoToMs(wall.startedAt) ?? stats.earliestDonationAt ?? now;
    daysLabel = activeLabel(daysBetween(startMs, now));
    openedAt = startMs;
  } else {
    const closedMs =
      isoToMs(wall.closedAt) ?? stats.latestDonationAt ?? now;
    daysLabel = closedLabel(daysBetween(closedMs, now));
    // Closed walls still report their open date so "wall opened since
    // last visit" works for a wall that opened and closed in the gap.
    openedAt = isoToMs(wall.startedAt) ?? stats.earliestDonationAt ?? null;
  }
  return {
    slug: wall.slug,
    title: wall.title,
    description: pickDescription(wall),
    totalRaisedCents: stats.totalRaisedCents,
    contributorCount: stats.contributorCount,
    status: wall.status,
    daysLabel,
    openedAt,
    url: `/walls/${wall.slug}`,
    otherActiveCount,
  };
}

/**
 * Returns the wall snapshot to feature on the Writer's Desk widget,
 * or null if no wall qualifies. Cheap to call — the only Redis hit
 * is for donation stats on the chosen wall (and any tied actives we
 * need to rank by activity).
 */
export async function getActiveWallSnapshot(
  now: number = Date.now()
): Promise<ActiveWallSnapshot | null> {
  const override = await getWallOverride();
  if (!override.enabled) return null;

  const all = getAllWalls();
  if (all.length === 0) return null;

  // Explicit pin wins: feature the named wall regardless of status.
  // Falls through to auto-selection if the slug doesn't match anything
  // (covers typos and content moves so the panel doesn't go dark).
  if (override.featuredSlug) {
    const pinned = all.find((w) => w.slug === override.featuredSlug);
    if (pinned) {
      const otherActiveCount = all.filter(
        (w) => w.status === "active" && w.slug !== pinned.slug
      ).length;
      return buildSnapshot(pinned, otherActiveCount, now);
    }
  }

  const actives = all.filter((w) => w.status === "active");

  if (actives.length > 0) {
    // Rank candidates by startedAt (frontmatter) then by earliest
    // donation timestamp. Wall with the most recent start wins.
    const ranked = await Promise.all(
      actives.map(async (w) => {
        const declared = isoToMs(w.startedAt);
        let start = declared;
        if (start === null) {
          const stats = await statsAndTimestamps(w);
          start = stats.earliestDonationAt;
        }
        return { wall: w, start: start ?? 0 };
      })
    );
    ranked.sort((a, b) => b.start - a.start);
    const chosen = ranked[0].wall;
    return buildSnapshot(chosen, actives.length - 1, now);
  }

  // No actives — look for a recently-closed wall (within 7 days of
  // its last approved donation OR its declared closedAt).
  const recentlyClosed: Array<{ wall: WallMeta; closedMs: number }> = [];
  for (const w of all.filter((x) => x.status === "closed")) {
    const declared = isoToMs(w.closedAt);
    const stats = await statsAndTimestamps(w);
    const closedMs = declared ?? stats.latestDonationAt ?? 0;
    if (closedMs === 0) continue;
    if (now - closedMs <= STALE_CLOSED_WINDOW_MS) {
      recentlyClosed.push({ wall: w, closedMs });
    }
  }
  if (recentlyClosed.length === 0) return null;
  recentlyClosed.sort((a, b) => b.closedMs - a.closedMs);
  return buildSnapshot(recentlyClosed[0].wall, 0, now);
}
