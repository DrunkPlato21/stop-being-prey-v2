import { Redis } from "@upstash/redis";
import { activityEventId, type CommentRecord } from "@/lib/comments";

// One-shot (idempotent) backfill for the two comment indexes. Walks
// every comment:<id> key once and fills in whatever is missing:
//
//   comments:all       the id, scored by createdAt. Run after deploying
//                      the chrono /admin/comments feed so pre-existing
//                      comments show up.
//   comments:activity  one event per comment AND one per thread reply,
//                      scored by when each happened. Replies never had
//                      an index entry at all before this — they only
//                      ever existed inside their parent's record — so
//                      every reply posted to date needs this pass to
//                      become visible to the admin feed and the dot.
//
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.

export const runtime = "nodejs";
export const maxDuration = 60;

const COMMENT_PREFIX = "comment:";
const ALL_INDEX_KEY = "comments:all";
const ACTIVITY_INDEX_KEY = "comments:activity";
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
  let activityAdded = 0;
  let repliesAdded = 0;

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

      const inAll = await client.zscore(ALL_INDEX_KEY, id);
      const inActivity = await client.zscore(
        ACTIVITY_INDEX_KEY,
        activityEventId(id)
      );
      const needsAll = inAll === null || inAll === undefined;
      const needsActivity = inActivity === null || inActivity === undefined;

      // A comment already in both indexes can still be hiding replies
      // that predate comments:activity, so the record has to be read
      // unless BOTH the comment's own entries are present and it has no
      // replies. We cannot know the reply count without reading, so the
      // only safe skip is "already in both" plus a cheap re-read below.
      if (!needsAll && !needsActivity) {
        skipped += 1;
      }

      const raw = await client.get<string>(key);
      const record = parseRecord(raw);
      if (!record || typeof record.createdAt !== "number") {
        unreadable += 1;
        continue;
      }

      if (needsAll) {
        await client.zadd(ALL_INDEX_KEY, {
          score: record.createdAt,
          member: id,
        });
        added += 1;
      }
      if (needsActivity) {
        await client.zadd(ACTIVITY_INDEX_KEY, {
          score: record.createdAt,
          member: activityEventId(id),
        });
        activityAdded += 1;
      }

      for (const reply of record.threadReplies ?? []) {
        if (!reply?.id || typeof reply.createdAt !== "number") continue;
        const member = activityEventId(id, reply.id);
        const present = await client.zscore(ACTIVITY_INDEX_KEY, member);
        if (present !== null && present !== undefined) continue;
        await client.zadd(ACTIVITY_INDEX_KEY, {
          score: reply.createdAt,
          member,
        });
        repliesAdded += 1;
      }
    }

    cursor =
      typeof nextCursor === "string"
        ? Number.parseInt(nextCursor, 10) || 0
        : nextCursor;
  } while (cursor !== 0);

  const summary =
    `Added ${added} comments to the chrono index, ` +
    `${activityAdded} comments and ${repliesAdded} replies to the activity ` +
    `index. Skipped ${skipped} already indexed.`;
  return Response.json({
    ok: true,
    summary,
    added,
    activityAdded,
    repliesAdded,
    skipped,
    unreadable,
  });
}
