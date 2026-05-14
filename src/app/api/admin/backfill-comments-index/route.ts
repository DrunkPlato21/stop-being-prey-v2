import { Redis } from "@upstash/redis";
import type { CommentRecord } from "@/lib/comments";

// One-shot (idempotent) backfill for the comments:all ZSET. Walks
// every comment:<id> key, reads the createdAt, and zadds the id with
// that score — only if not already present. Run once after deploying
// the chrono /admin/comments feed so pre-existing comments show up.
//
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.

export const runtime = "nodejs";
export const maxDuration = 60;

const COMMENT_PREFIX = "comment:";
const ALL_INDEX_KEY = "comments:all";
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

function parseRecord(raw: unknown): CommentRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as CommentRecord)
      : (raw as CommentRecord);
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

  do {
    const result = (await client.scan(cursor, {
      match: `${COMMENT_PREFIX}*`,
      count: SCAN_PAGE_SIZE,
    })) as [string | number, string[]];

    const nextCursor = result[0];
    const keys = Array.isArray(result[1]) ? result[1] : [];

    for (const key of keys) {
      const id = key.slice(COMMENT_PREFIX.length);
      if (!id) continue;

      const existing = await client.zscore(ALL_INDEX_KEY, id);
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

      await client.zadd(ALL_INDEX_KEY, {
        score: record.createdAt,
        member: id,
      });
      added += 1;
    }

    cursor =
      typeof nextCursor === "string"
        ? Number.parseInt(nextCursor, 10) || 0
        : nextCursor;
  } while (cursor !== 0);

  const summary = `Added ${added} comments to index. Skipped ${skipped} already present.`;
  return Response.json({
    ok: true,
    summary,
    added,
    skipped,
    unreadable,
  });
}
