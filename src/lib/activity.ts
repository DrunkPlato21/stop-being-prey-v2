import { Redis } from "@upstash/redis";
import {
  type CommentRecord,
  type CommentKind,
} from "./comments";
import { MEMBER_PREFIX } from "./members";

// Activity stripe aggregator. Pulls "stuff that happened in the last
// N hours" across three lanes (new members, comments, wall donations)
// and merges them into a single newest-first stream for the DEN
// widget. Server-side, light: each lane scans only the relevant index
// for the last N hours rather than walking everything.

export type ActivityKind = "member" | "comment" | "donation";

export type ActivityEvent = {
  kind: ActivityKind;
  at: number;
  // Lane-specific payloads — kept narrow so the DEN renderer can
  // pattern-match without exhaustive type plumbing.
  member?: {
    tier: "founder" | "charter" | "regular";
    founderSlot: number | null;
    charterSlot: number | null;
  };
  comment?: {
    displayName: string;
    body: string;
    pieceKind: CommentKind;
    pieceSlug: string;
  };
  donation?: {
    name: string;
    amountCents: number;
    wallSlug: string;
  };
};

const DEFAULT_WINDOW_HOURS = 48;

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

type MemberRecordShape = {
  email: string;
  tier: "founder" | "charter" | "regular";
  founderSlot: number | null;
  charterSlot: number | null;
  createdAt: number;
};

type WallDonationShape = {
  name: string;
  amountCents: number;
  wallSlug: string;
  timestamp: number;
  anonymous?: boolean;
};

/**
 * Aggregate recent activity across lanes. Returns newest-first, capped
 * by `limit`. `windowHours` controls how far back each lane is willing
 * to look (default 48h). If Redis is unconfigured or all lanes are
 * empty, returns [].
 */
export async function getRecentActivity({
  windowHours = DEFAULT_WINDOW_HOURS,
  limit = 12,
}: {
  windowHours?: number;
  limit?: number;
} = {}): Promise<ActivityEvent[]> {
  const client = getClient();
  if (!client) return [];

  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const events: ActivityEvent[] = [];

  // --- Lane 1: new member signups ---
  // member:* keys are JSON records; we don't have a sorted index for
  // them, so scan a small window of keys. For V1 this is fine because
  // member counts are low; if member volume grows we'll add a sorted
  // index keyed by createdAt.
  try {
    const memberKeys = (await client.keys(`${MEMBER_PREFIX}*`)) ?? [];
    const detailKeys = memberKeys.filter(
      (k) => !k.startsWith(`${MEMBER_PREFIX}by-`)
    );
    if (detailKeys.length > 0) {
      const rawMembers = (await client.mget<(string | null)[]>(
        ...detailKeys
      )) ?? [];
      for (const raw of rawMembers) {
        const parsed = parse<MemberRecordShape>(raw);
        if (!parsed) continue;
        if (parsed.createdAt < cutoff) continue;
        events.push({
          kind: "member",
          at: parsed.createdAt,
          member: {
            tier: parsed.tier,
            founderSlot: parsed.founderSlot,
            charterSlot: parsed.charterSlot ?? null,
          },
        });
      }
    }
  } catch {
    // best-effort — a single lane failing shouldn't tank the stripe
  }

  // --- Lane 2: recent comments ---
  // Comments don't have a global sorted index by createdAt; we have
  // per-piece ZSETs and a global pending ZSET. For the activity stripe
  // we don't want pending-only (which would mostly be spam), so we
  // walk recent member-comments sets. Simpler: keys("comment:*")
  // bounded by the same scan pattern.
  try {
    const commentKeys = (await client.keys("comment:*")) ?? [];
    if (commentKeys.length > 0) {
      // Cap how many we materialise — at ~hundreds of comments this is
      // fine; at thousands we'd need a sorted index. Future work.
      const sample = commentKeys.slice(0, 200);
      const rawComments = (await client.mget<(string | null)[]>(
        ...sample
      )) ?? [];
      for (const raw of rawComments) {
        const parsed = parse<CommentRecord>(raw);
        if (!parsed) continue;
        if (parsed.createdAt < cutoff) continue;
        // Only show approved comments — pending comments are private
        // to author + admin, not stripe material.
        if (parsed.approved === false) continue;
        events.push({
          kind: "comment",
          at: parsed.createdAt,
          comment: {
            displayName: parsed.displayName,
            body: parsed.body,
            pieceKind: parsed.kind,
            pieceSlug: parsed.slug,
          },
        });
      }
    }
  } catch {
    // best-effort
  }

  // --- Lane 3: recent wall donations ---
  // Wall donations have per-wall sorted indexes (wallDonations.ts uses
  // `wall:<slug>:donations` ZSET keyed by timestamp). We don't know
  // every wall slug here without walking the walls dir, so we use a
  // global pattern scan as best-effort.
  try {
    const donationKeys = (await client.keys("walldonation:*")) ?? [];
    if (donationKeys.length > 0) {
      const sample = donationKeys.slice(0, 200);
      const raw = (await client.mget<(string | null)[]>(...sample)) ?? [];
      for (const value of raw) {
        const parsed = parse<WallDonationShape>(value);
        if (!parsed) continue;
        if (parsed.timestamp < cutoff) continue;
        events.push({
          kind: "donation",
          at: parsed.timestamp,
          donation: {
            name: parsed.anonymous ? "anonymous" : parsed.name || "anonymous",
            amountCents: parsed.amountCents,
            wallSlug: parsed.wallSlug,
          },
        });
      }
    }
  } catch {
    // best-effort
  }

  events.sort((a, b) => b.at - a.at);
  return events.slice(0, limit);
}
