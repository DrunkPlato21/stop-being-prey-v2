import { Redis } from "@upstash/redis";
import {
  MEMBER_PREFIX,
  MEMBER_BY_CUSTOMER_PREFIX as BY_CUSTOMER_PREFIX,
  MEMBER_BY_SESSION_PREFIX as BY_SESSION_PREFIX,
  MEMBERS_ALL_INDEX,
  type MemberRecord,
} from "@/lib/members";

// One-shot (idempotent) backfill for the members:all ZSET index.
// Walks every member:<email> key, skips the reverse-index keys
// (member:by-customer:* and member:by-session:*), and adds the email
// to members:all with its createdAt as score — but only if it
// isn't already there. Safe to run multiple times.
//
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*. Run before
// launch so pre-existing founders are visible to fan-out broadcasts
// (new essay, new wall, new voice memo).

export const runtime = "nodejs";
export const maxDuration = 60;

const SCAN_PAGE_SIZE = 200;

let cached: Redis | null = null;
function getRedis(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

function parseRecord(raw: unknown): MemberRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as MemberRecord)
      : (raw as MemberRecord);
  } catch {
    return null;
  }
}

export async function POST() {
  const client = getRedis();
  if (!client) {
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let cursor: string | number = 0;
  let added = 0;
  let skipped = 0;
  let unreadable = 0;

  // SCAN with MATCH "member:*" surfaces the primary records and both
  // reverse indices. We filter the reverse-index prefixes out before
  // attempting to read + parse the JSON. Loop until cursor returns
  // to 0 — Upstash returns "0" as a string when the cursor wraps.
  do {
    const result = (await client.scan(cursor, {
      match: `${MEMBER_PREFIX}*`,
      count: SCAN_PAGE_SIZE,
    })) as [string | number, string[]];

    const nextCursor = result[0];
    const keys = Array.isArray(result[1]) ? result[1] : [];

    for (const key of keys) {
      if (
        key.startsWith(BY_CUSTOMER_PREFIX) ||
        key.startsWith(BY_SESSION_PREFIX)
      ) {
        continue;
      }
      const email = key.slice(MEMBER_PREFIX.length).toLowerCase();
      if (!email) continue;

      // Idempotency: if the email already has a score in the index,
      // count it as skipped rather than overwriting the score.
      const existing = await client.zscore(MEMBERS_ALL_INDEX, email);
      if (existing !== null && existing !== undefined) {
        skipped += 1;
        continue;
      }

      const raw = await client.get<string>(key);
      const record = parseRecord(raw);
      if (!record || typeof record.createdAt !== "number") {
        unreadable += 1;
        continue;
      }

      await client.zadd(MEMBERS_ALL_INDEX, {
        score: record.createdAt,
        member: email,
      });
      added += 1;
    }

    cursor =
      typeof nextCursor === "string"
        ? Number.parseInt(nextCursor, 10) || 0
        : nextCursor;
  } while (cursor !== 0);

  const summary = `Added ${added} members to index. Skipped ${skipped} already present.`;
  return Response.json({
    ok: true,
    summary,
    added,
    skipped,
    unreadable,
  });
}
