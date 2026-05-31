import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { getComment, getProfile, type CommentKind } from "./comments";

// Coins — a scarce, permanent endorsement on a top-level comment.
//
// Each member gets exactly ONE coin per piece (kind+slug). They give it
// to a single top-level comment. Giving is permanent: no undo, the
// spent-key is never cleared, and deleting a comment does NOT refund.
// Replies are not coin-eligible. A member cannot coin their own comment.
//
// Redis schema:
//   coins:spent:<email>:<kind>:<slug>   string = commentId
//       The one-coin-per-piece lock. Its existence == coin spent. Set
//       once via an atomic Lua SET-if-absent; never deleted. This single
//       key enforces one-per-piece AND non-reversibility.
//   coins:comment:<commentId>           ZSET score=givenAt, member=giverEmail
//       The givers of one comment. ZCARD = coin count; ZRANGE = who.
//   coins:score:<kind>:<slug>           ZSET score=coinCount, member=commentId
//       Per-piece ranking index. Kept in sync by the give transaction so
//       counts can be read in one round-trip for sorting.
//   coins:received:<recipientEmail>     ZSET score=givenAt, member=receiptId
//       Durable per-recipient ledger. Powers "Your Coins". Does NOT
//       expire (unlike notifications, which prune).
//   coin-receipt:<receiptId>            JSON CoinReceipt
//
// Identity is the normalized member email, same as comments/notifications.

const SPENT_PREFIX = "coins:spent:";
const GIVERS_PREFIX = "coins:comment:";
const SCORE_PREFIX = "coins:score:";
const RECEIVED_PREFIX = "coins:received:";
const RECEIPT_PREFIX = "coin-receipt:";

const MAX_EXCERPT = 140;

export type CoinReceipt = {
  id: string;
  recipientEmail: string;
  giverEmail: string;
  giverDisplayName: string;
  commentId: string;
  kind: CommentKind;
  slug: string;
  commentExcerpt: string;
  givenAt: number;
};

// What CommentItem needs to render a comment's coin state.
export type CoinDisplay = {
  count: number;
  // Up to a few giver display names (most recent first) for the
  // "Bob, Mary and 3 others" summary. May be shorter than `count`.
  topGivers: string[];
};

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

export function isCoinsConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function spentKey(email: string, kind: CommentKind, slug: string): string {
  return `${SPENT_PREFIX}${normEmail(email)}:${kind}:${slug}`;
}
function giversKey(commentId: string): string {
  return `${GIVERS_PREFIX}${commentId}`;
}
function scoreKey(kind: CommentKind, slug: string): string {
  return `${SCORE_PREFIX}${kind}:${slug}`;
}
function receivedKey(email: string): string {
  return `${RECEIVED_PREFIX}${normEmail(email)}`;
}
function receiptKey(id: string): string {
  return `${RECEIPT_PREFIX}${id}`;
}

export type GiveCoinInput = {
  giverEmail: string;
  giverDisplayName: string;
  commentId: string;
};

export type GiveCoinResult =
  | { ok: true; count: number; recipientEmail: string; comment: import("./comments").CommentRecord }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "not_found"
        | "self_coin"
        | "already_spent";
      // When already_spent, the comment id the member previously funded.
      spentOn?: string;
    };

/**
 * Give the caller's one coin for this piece to a top-level comment.
 *
 * The integrity-critical part is a single Lua script: it refuses if the
 * spent-key already exists (one-per-piece + no-undo), otherwise sets the
 * spent-key, records the giver, and bumps the ranking score — all in one
 * atomic round-trip so a double-click or refresh can never double-spend.
 *
 * Self-coin and reply-coin are rejected before the script (a reply id
 * won't resolve via getComment, which only returns top-level records).
 */
export async function giveCoin(input: GiveCoinInput): Promise<GiveCoinResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const giver = normEmail(input.giverEmail);
  if (!giver) return { ok: false, error: "self_coin" };

  // Resolve the target. getComment only returns top-level comment
  // records, so a reply id (or anything bogus) lands here as not_found,
  // which is exactly the v1 rule: replies are not coin-eligible.
  const comment = await getComment(input.commentId);
  if (!comment) return { ok: false, error: "not_found" };

  if (comment.email === giver) {
    return { ok: false, error: "self_coin" };
  }

  const now = Date.now();
  // KEYS: spent, givers, score   ARGV: commentId, giverEmail, givenAt
  const script = `
    local existing = redis.call('GET', KEYS[1])
    if existing then
      return 'SPENT:' .. existing
    end
    redis.call('SET', KEYS[1], ARGV[1])
    redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[2])
    local count = redis.call('ZINCRBY', KEYS[3], 1, ARGV[1])
    return 'OK:' .. count
  `;

  const raw = await client.eval(
    script,
    [
      spentKey(giver, comment.kind, comment.slug),
      giversKey(comment.id),
      scoreKey(comment.kind, comment.slug),
    ],
    [comment.id, giver, String(now)]
  );

  const result = typeof raw === "string" ? raw : String(raw);
  if (result.startsWith("SPENT:")) {
    return {
      ok: false,
      error: "already_spent",
      spentOn: result.slice("SPENT:".length),
    };
  }
  const count = Number.parseInt(result.replace(/^OK:/, ""), 10) || 1;

  // Durable ledger + receipt (best-effort, post-commit — same pattern as
  // notifications). The coin itself is already given and counted above;
  // a ledger hiccup degrades "Your Coins" history, not the endorsement.
  const receiptId = randomUUID();
  const receipt: CoinReceipt = {
    id: receiptId,
    recipientEmail: comment.email,
    giverEmail: giver,
    giverDisplayName: input.giverDisplayName,
    commentId: comment.id,
    kind: comment.kind,
    slug: comment.slug,
    commentExcerpt: comment.body.slice(0, MAX_EXCERPT),
    givenAt: now,
  };
  try {
    await client.set(receiptKey(receiptId), JSON.stringify(receipt));
    await client.zadd(receivedKey(comment.email), {
      score: now,
      member: receiptId,
    });
  } catch (err) {
    console.error(`[coins] ledger write failed for ${receiptId}:`, err);
  }

  return { ok: true, count, recipientEmail: comment.email, comment };
}

/**
 * The comment id this member gave their coin to on this piece, or null
 * if their coin is unspent here. Drives the dead-obvious "you still have
 * your coin" vs "you gave it to [name]" UI state.
 */
export async function getSpentCommentId(
  email: string,
  kind: CommentKind,
  slug: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const norm = normEmail(email);
  if (!norm) return null;
  const value = await client.get<string>(spentKey(norm, kind, slug));
  return typeof value === "string" && value ? value : null;
}

/**
 * Coin display data (count + a few giver names) for a set of comments.
 * One ZCARD + one short ZRANGE per comment, with giver-name lookups
 * deduped across the batch. Fine at launch volume; revisit if a single
 * piece routinely carries hundreds of coined comments.
 */
export async function getCoinDataForComments(
  commentIds: string[]
): Promise<Map<string, CoinDisplay>> {
  const out = new Map<string, CoinDisplay>();
  const client = getClient();
  if (!client || commentIds.length === 0) return out;

  // Resolve a giver email to a display name once per batch.
  const nameCache = new Map<string, string>();
  async function nameFor(email: string): Promise<string> {
    const norm = normEmail(email);
    const hit = nameCache.get(norm);
    if (hit !== undefined) return hit;
    const profile = await getProfile(norm).catch(() => null);
    const name =
      profile?.displayName?.trim() || norm.split("@")[0] || "A member";
    nameCache.set(norm, name);
    return name;
  }

  for (const id of commentIds) {
    const count = (await client.zcard(giversKey(id)).catch(() => 0)) ?? 0;
    if (!count) {
      out.set(id, { count: 0, topGivers: [] });
      continue;
    }
    // Most-recent givers first.
    const recent = (await client
      .zrange(giversKey(id), 0, 2, { rev: true })
      .catch(() => [] as unknown[])) as string[];
    const topGivers: string[] = [];
    for (const email of recent) {
      if (typeof email === "string") topGivers.push(await nameFor(email));
    }
    out.set(id, { count, topGivers });
  }
  return out;
}

function parseReceipt(raw: unknown): CoinReceipt | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string" ? (JSON.parse(raw) as CoinReceipt) : (raw as CoinReceipt);
    if (!parsed || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Coins this member has RECEIVED, newest first. Reads the durable ledger
 * (never pruned), so "Your Coins" keeps full history.
 */
export async function listReceivedCoins(
  email: string,
  opts?: { limit?: number }
): Promise<CoinReceipt[]> {
  const client = getClient();
  if (!client) return [];
  const norm = normEmail(email);
  if (!norm) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const ids = (await client
    .zrange(receivedKey(norm), 0, limit - 1, { rev: true })
    .catch(() => [] as unknown[])) as string[];
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const keys = ids.map((id) => receiptKey(id));
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: CoinReceipt[] = [];
  for (const value of raw) {
    const parsed = parseReceipt(value);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => b.givenAt - a.givenAt);
  return out;
}
