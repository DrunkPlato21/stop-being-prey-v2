import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// The Lounge: member-to-member async discussion. Short posts (≤280),
// one-level-deep replies, single-reaction-per-target (the olive ✓).
// Clay drops in when something earns it; otherwise the space is
// owned by members.
//
// Redis schema:
//   lounge:posts                       ZSET, score=createdAt, member=postId
//   lounge:post:<id>                   JSON LoungePost
//   lounge:post:<id>:replies           ZSET, score=createdAt, member=replyId
//   lounge:reply:<id>                  JSON LoungeReply
//   lounge:post:<id>:reactions         SET of emails who reacted
//   lounge:reply:<id>:reactions        SET of emails who reacted
//   lounge:pinned                      STRING postId (or absent if none pinned)
//   lounge:lastviewed:<email>          STRING integer (ms)
//   lounge:moderation                  ZSET, score=ts, member=JSON ModerationEntry
//   lounge:rate:posts:<email>          ZSET, score=ts, member=postId
//   lounge:rate:replies:<email>        ZSET, score=ts, member=replyId
//
// Rate limits enforced server-side. Admin bypasses every limit.

// Member-area launch reference for the "open since" footer line.
// Update this constant when you want a different date than the
// initial launch. ISO-8601 (YYYY-MM-DD), interpreted as UTC.
export const MEMBER_AREA_LAUNCH_ISO = "2026-05-12";

const POSTS_INDEX = "lounge:posts";
const AUTHORS_KEY = "lounge:authors";
const ACTIVE_NOW_KEY = "lounge:active-now";
const ACTIVE_NOW_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_NOW_PRUNE_AFTER_MS = 30 * 60 * 1000;
const POST_PREFIX = "lounge:post:";
const REPLY_PREFIX = "lounge:reply:";
const POST_REPLIES_SUFFIX = ":replies";
const POST_REACTIONS_SUFFIX = ":reactions";
const REPLY_REACTIONS_SUFFIX = ":reactions";
const PINNED_KEY = "lounge:pinned";
const LAST_VIEWED_PREFIX = "lounge:lastviewed:";
const MODERATION_LOG_KEY = "lounge:moderation";
// Read-by-Clay receipts. Two SETs holding the ids of posts/replies
// Clay has marked as read. Sparse signal — admin opts each one in.
// Members render an eye glyph next to the post/reply timestamp when
// the id is in the set. Admin can toggle off if mis-clicked.
const READ_BY_CLAY_POSTS_KEY = "lounge:read-by-clay:posts";
const READ_BY_CLAY_REPLIES_KEY = "lounge:read-by-clay:replies";
const RATE_POSTS_PREFIX = "lounge:rate:posts:";
const RATE_REPLIES_PREFIX = "lounge:rate:replies:";

export const MAX_BODY = 280;
// Short cooldowns to catch accidental double-submits and basic
// scripts. No daily caps — trust the membership.
export const POST_COOLDOWN_MS = 60_000;
export const REPLY_COOLDOWN_MS = 30_000;
// Used by the rate-limit ZSET prune so it doesn't grow unbounded.
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MODERATION_LOG_TRIM = 500;

// Reaction set. FB-style picker, curated to the site's voice. Order
// here is the order rendered in the picker; "like" is the default
// label everywhere.
export const REACTION_KEYS = [
  "like",
  "love",
  "fire",
  "laugh",
  "wow",
  "hundred",
] as const;
export type ReactionKey = (typeof REACTION_KEYS)[number];

export function isReactionKey(value: unknown): value is ReactionKey {
  return (
    typeof value === "string" &&
    (REACTION_KEYS as readonly string[]).includes(value)
  );
}

export const REACTION_EMOJI: Record<ReactionKey, string> = {
  like: "👍",
  love: "❤️",
  fire: "🔥",
  laugh: "😂",
  wow: "😮",
  hundred: "💯",
};

export const REACTION_LABEL: Record<ReactionKey, string> = {
  like: "Like",
  love: "Love",
  fire: "Fire",
  laugh: "Laugh",
  wow: "Wow",
  hundred: "Hundred",
};

export type ReactionCounts = Record<ReactionKey, number>;

export function emptyReactionCounts(): ReactionCounts {
  return { like: 0, love: 0, fire: 0, laugh: 0, wow: 0, hundred: 0 };
}

export type LoungePost = {
  id: string;
  memberEmail: string;
  firstName: string;
  isFounder: boolean;
  body: string;
  createdAt: number;
  /** Last-bumped timestamp — equals createdAt at first, then bumps to
      `now` whenever a reply is added. Drives the feed's "active
      conversations rise" sort: POSTS_INDEX's score is kept in sync
      with this value. Reactions intentionally don't bump it — a
      single thumbs-up shouldn't reorder the room. */
  lastActivityAt: number;
  pinned: boolean;
  deleted: boolean;
  /** Total across all reaction keys. Denormalized for fast feed
      rendering; per-key breakdown derived from the reactions hash. */
  reactionCount: number;
  replyCount: number;
};

export type LoungeReply = {
  id: string;
  parentPostId: string;
  memberEmail: string;
  firstName: string;
  isFounder: boolean;
  body: string;
  createdAt: number;
  deleted: boolean;
  reactionCount: number;
};

export type ModerationEntry = {
  ts: number;
  action: "delete_post" | "delete_reply" | "pin" | "unpin";
  targetId: string;
  targetParentId?: string;
  authorEmail: string;
  authorFirstName: string;
  bodySnapshot: string;
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

export function isLoungeConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function sanitizeBody(input: string): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_BODY);
}

function parsePost(raw: unknown): LoungePost | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<LoungePost>)
        : (raw as Partial<LoungePost>);
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }
    // Backfill lastActivityAt on records written before the bump-sort
    // change. createdAt is the safe default — a post with no replies
    // has no "activity" past its creation.
    const lastActivityAt =
      typeof parsed.lastActivityAt === "number"
        ? parsed.lastActivityAt
        : parsed.createdAt;
    return { ...(parsed as LoungePost), lastActivityAt };
  } catch {
    return null;
  }
}

function parseReply(raw: unknown): LoungeReply | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as LoungeReply)
      : (raw as LoungeReply);
  } catch {
    return null;
  }
}

/* === Rate limit ============================================ */

export type RateCheckResult =
  | { ok: true }
  | { ok: false; reason: "cooldown"; secondsRemaining: number };

async function checkRate(
  email: string,
  kind: "post" | "reply",
  options: { isAdmin: boolean }
): Promise<RateCheckResult> {
  if (options.isAdmin) return { ok: true };
  const client = getClient();
  if (!client) return { ok: true };

  const key =
    kind === "post"
      ? `${RATE_POSTS_PREFIX}${email}`
      : `${RATE_REPLIES_PREFIX}${email}`;
  const cooldown = kind === "post" ? POST_COOLDOWN_MS : REPLY_COOLDOWN_MS;
  const now = Date.now();

  // Prune older entries so the ZSET stays bounded. We only need the
  // most recent entry for the cooldown check.
  await client.zremrangebyscore(key, 0, now - RATE_WINDOW_MS).catch(() => null);

  const latestRaw = await client
    .zrange(key, 0, 0, { rev: true, withScores: true })
    .catch(() => [] as unknown[]);
  const latestArr = Array.isArray(latestRaw) ? latestRaw : [];
  if (latestArr.length >= 2) {
    const latestScore = Number(latestArr[1]);
    if (Number.isFinite(latestScore) && now - latestScore < cooldown) {
      const secondsRemaining = Math.ceil(
        (cooldown - (now - latestScore)) / 1000
      );
      return { ok: false, reason: "cooldown", secondsRemaining };
    }
  }

  return { ok: true };
}

async function recordRate(
  email: string,
  kind: "post" | "reply",
  id: string,
  now: number,
  options: { isAdmin: boolean }
): Promise<void> {
  if (options.isAdmin) return;
  const client = getClient();
  if (!client) return;
  const key =
    kind === "post"
      ? `${RATE_POSTS_PREFIX}${email}`
      : `${RATE_REPLIES_PREFIX}${email}`;
  await client.zadd(key, { score: now, member: id }).catch(() => null);
}

/* === Posts ================================================= */

export type CreatePostInput = {
  memberEmail: string;
  firstName: string;
  isFounder: boolean;
  body: string;
  isAdmin: boolean;
};

export type CreatePostResult =
  | { ok: true; post: LoungePost }
  | { ok: false; error: "storage_unavailable" | "empty_body" }
  | {
      ok: false;
      error: "rate_limited";
      reason: "cooldown";
      secondsRemaining: number;
    };

export async function createPost(
  input: CreatePostInput
): Promise<CreatePostResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const body = sanitizeBody(input.body);
  if (!body) return { ok: false, error: "empty_body" };

  const email = normEmail(input.memberEmail);
  const rate = await checkRate(email, "post", { isAdmin: input.isAdmin });
  if (!rate.ok) {
    return {
      ok: false,
      error: "rate_limited",
      reason: rate.reason,
      secondsRemaining: rate.secondsRemaining,
    };
  }

  const id = randomUUID();
  const now = Date.now();
  const post: LoungePost = {
    id,
    memberEmail: email,
    firstName: input.firstName.trim().slice(0, 30) || email.split("@")[0],
    isFounder: !!input.isFounder,
    body,
    createdAt: now,
    lastActivityAt: now,
    pinned: false,
    deleted: false,
    reactionCount: 0,
    replyCount: 0,
  };

  await client.set(`${POST_PREFIX}${id}`, JSON.stringify(post));
  // POSTS_INDEX score is lastActivityAt — created posts start with
  // score === createdAt, which is identical at creation but diverges
  // once a reply lands.
  await client.zadd(POSTS_INDEX, { score: now, member: id });
  // Tracks the set of unique authors so the footer line can show a
  // real count without scanning the post records on every page load.
  await client.sadd(AUTHORS_KEY, email).catch(() => null);
  await recordRate(email, "post", id, now, { isAdmin: input.isAdmin });

  return { ok: true, post };
}

/**
 * Count of distinct members who've ever posted in the Lounge. Drives
 * the atmospheric footer line. Cheap O(1) via SCARD.
 */
export async function countLoungeAuthors(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const n = await client.scard(AUTHORS_KEY).catch(() => 0);
  return typeof n === "number" ? n : 0;
}

export async function getPost(id: string): Promise<LoungePost | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${POST_PREFIX}${id}`);
  return parsePost(raw);
}

async function writePost(post: LoungePost): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${POST_PREFIX}${post.id}`, JSON.stringify(post));
}

export async function listVisiblePosts(opts?: {
  limit?: number;
  /** Cursor: lastActivityAt of the last post on the previous page.
      Pagination walks down the POSTS_INDEX zset by score, which is
      the same as lastActivityAt — so "load more" returns posts older
      (less recently active) than the cursor. */
  before?: number;
}): Promise<{ posts: LoungePost[]; hasMore: boolean }> {
  const client = getClient();
  if (!client) return { posts: [], hasMore: false };
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);

  // Fetch a buffer past the limit so we can detect hasMore even when
  // some entries are filtered out for soft-delete.
  const fetchSize = limit + 10;
  let ids: string[];
  if (typeof opts?.before === "number" && Number.isFinite(opts.before)) {
    const raw = (await client
      .zrange(POSTS_INDEX, opts.before - 1, "-inf", {
        byScore: true,
        rev: true,
        offset: 0,
        count: fetchSize,
      })
      .catch(() => [] as unknown[])) as string[];
    ids = Array.isArray(raw) ? raw : [];
  } else {
    const raw = (await client
      .zrange(POSTS_INDEX, 0, fetchSize - 1, { rev: true })
      .catch(() => [] as unknown[])) as string[];
    ids = Array.isArray(raw) ? raw : [];
  }
  if (ids.length === 0) return { posts: [], hasMore: false };

  const keys = ids.map((id) => `${POST_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: LoungePost[] = [];
  for (const value of raw) {
    const parsed = parsePost(value);
    if (parsed && !parsed.deleted) {
      out.push(parsed);
      if (out.length === limit) break;
    }
  }
  // Sort by lastActivityAt so active conversations rise. The zset is
  // already in this order, but mget loses it.
  out.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  // hasMore: if we filled the limit and there were ids past what we
  // returned. Approximate but cheap; a definitive check needs another
  // ZRANGE which isn't worth the cost.
  const hasMore = ids.length >= fetchSize && out.length === limit;
  return { posts: out, hasMore };
}

export async function getPinnedPost(): Promise<LoungePost | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(PINNED_KEY).catch(() => null);
  if (!id || typeof id !== "string") return null;
  const post = await getPost(id);
  if (!post || post.deleted) return null;
  return post;
}

/* === Replies =============================================== */

export type CreateReplyInput = {
  parentPostId: string;
  memberEmail: string;
  firstName: string;
  isFounder: boolean;
  body: string;
  isAdmin: boolean;
};

export type CreateReplyResult =
  | { ok: true; reply: LoungeReply }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "empty_body"
        | "parent_not_found"
        | "parent_deleted";
    }
  | {
      ok: false;
      error: "rate_limited";
      reason: "cooldown";
      secondsRemaining: number;
    };

export async function createReply(
  input: CreateReplyInput
): Promise<CreateReplyResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const body = sanitizeBody(input.body);
  if (!body) return { ok: false, error: "empty_body" };

  const parent = await getPost(input.parentPostId);
  if (!parent) return { ok: false, error: "parent_not_found" };
  if (parent.deleted) return { ok: false, error: "parent_deleted" };

  const email = normEmail(input.memberEmail);
  const rate = await checkRate(email, "reply", { isAdmin: input.isAdmin });
  if (!rate.ok) {
    return {
      ok: false,
      error: "rate_limited",
      reason: rate.reason,
      secondsRemaining: rate.secondsRemaining,
    };
  }

  const id = randomUUID();
  const now = Date.now();
  const reply: LoungeReply = {
    id,
    parentPostId: input.parentPostId,
    memberEmail: email,
    firstName: input.firstName.trim().slice(0, 30) || email.split("@")[0],
    isFounder: !!input.isFounder,
    body,
    createdAt: now,
    deleted: false,
    reactionCount: 0,
  };

  await client.set(`${REPLY_PREFIX}${id}`, JSON.stringify(reply));
  await client.zadd(
    `${POST_PREFIX}${input.parentPostId}${POST_REPLIES_SUFFIX}`,
    { score: now, member: id }
  );
  parent.replyCount += 1;
  parent.lastActivityAt = now;
  await writePost(parent);
  // Re-score the POSTS_INDEX entry so the parent floats back to the
  // top of the feed. zadd is upsert — replaces the existing score.
  // Pinned posts are still rendered separately by the page (they live
  // in the index too, but the UI pulls them via getPinnedPost()), so
  // re-scoring is safe regardless of pin state.
  await client
    .zadd(POSTS_INDEX, { score: now, member: input.parentPostId })
    .catch(() => null);
  await recordRate(email, "reply", id, now, { isAdmin: input.isAdmin });

  return { ok: true, reply };
}

export async function getReply(id: string): Promise<LoungeReply | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${REPLY_PREFIX}${id}`);
  return parseReply(raw);
}

async function writeReply(reply: LoungeReply): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${REPLY_PREFIX}${reply.id}`, JSON.stringify(reply));
}

export async function listVisibleReplies(
  postId: string,
  limit = 50
): Promise<LoungeReply[]> {
  const client = getClient();
  if (!client) return [];
  const idsRaw = (await client
    .zrange(`${POST_PREFIX}${postId}${POST_REPLIES_SUFFIX}`, 0, limit - 1)
    .catch(() => [] as unknown[])) as string[];
  const ids = Array.isArray(idsRaw) ? idsRaw : [];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${REPLY_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: LoungeReply[] = [];
  for (const value of raw) {
    const parsed = parseReply(value);
    if (parsed && !parsed.deleted) out.push(parsed);
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

/* === Reactions ============================================ */

export type ReactionTarget =
  | { kind: "post"; id: string; reactionCount?: number }
  | { kind: "reply"; id: string; reactionCount?: number };

export type ReactionSnapshot = {
  counts: ReactionCounts;
  total: number;
  myReaction: ReactionKey | null;
};

export type SetReactionResult =
  | {
      ok: true;
      counts: ReactionCounts;
      total: number;
      myReaction: ReactionKey | null;
      added: boolean;
      targetMemberEmail: string;
      bodySnapshot: string;
      parentPostId: string;
    }
  | { ok: false; error: "storage_unavailable" | "not_found" };

function reactionHashKeyFor(target: ReactionTarget): string {
  if (target.kind === "post") {
    return `${POST_PREFIX}${target.id}${POST_REACTIONS_SUFFIX}`;
  }
  return `${REPLY_PREFIX}${target.id}${REPLY_REACTIONS_SUFFIX}`;
}

function aggregateCounts(
  hash: Record<string, unknown> | null | undefined
): { counts: ReactionCounts; total: number } {
  const counts = emptyReactionCounts();
  if (!hash) return { counts, total: 0 };
  let total = 0;
  for (const value of Object.values(hash)) {
    if (isReactionKey(value)) {
      counts[value] += 1;
      total += 1;
    }
  }
  return { counts, total };
}

/**
 * Set/replace/remove the caller's reaction on a target.
 *
 *   choice = null            → clear any existing reaction
 *   choice = matches current → clear (toggle off)
 *   choice = new key         → set/replace
 *
 * Returns the resulting per-key counts + total + the caller's
 * resulting reaction, plus context for notification fires (the
 * target's author email + body excerpt + parent post id).
 */
export async function setReaction(
  target: ReactionTarget,
  reactorEmail: string,
  choice: ReactionKey | null
): Promise<SetReactionResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const norm = normEmail(reactorEmail);
  if (!norm) return { ok: false, error: "not_found" };

  let post: LoungePost | null = null;
  let reply: LoungeReply | null = null;

  if (target.kind === "post") {
    post = await getPost(target.id);
    if (!post || post.deleted) return { ok: false, error: "not_found" };
  } else {
    reply = await getReply(target.id);
    if (!reply || reply.deleted) return { ok: false, error: "not_found" };
  }

  const hashKey = reactionHashKeyFor(target);
  const prior = (await client.hget<string>(hashKey, norm).catch(() => null)) as
    | string
    | null;
  const priorKey: ReactionKey | null = isReactionKey(prior) ? prior : null;

  // Decide what the caller's resulting reaction is. Choosing the
  // same key you already have toggles off — same UX as FB-style
  // tap-the-same-emoji-again.
  let next: ReactionKey | null = choice;
  if (choice !== null && priorKey === choice) {
    next = null;
  }

  if (next === null) {
    if (priorKey !== null) {
      await client.hdel(hashKey, norm).catch(() => null);
    }
  } else {
    await client.hset(hashKey, { [norm]: next }).catch(() => null);
  }

  // Read the whole hash to compute fresh counts. Cheap at the
  // launch-volume scale we're at.
  const fresh = (await client
    .hgetall<Record<string, unknown>>(hashKey)
    .catch(() => null)) as Record<string, unknown> | null;
  const { counts, total } = aggregateCounts(fresh);

  // Keep the denormalized total on the post/reply in sync so the
  // feed renders accurately without re-aggregating on every read.
  const added = next !== null && priorKey === null;
  if (post) {
    post.reactionCount = total;
    await writePost(post);
    return {
      ok: true,
      counts,
      total,
      myReaction: next,
      added,
      targetMemberEmail: post.memberEmail,
      bodySnapshot: post.body,
      parentPostId: post.id,
    };
  }
  reply!.reactionCount = total;
  await writeReply(reply!);
  return {
    ok: true,
    counts,
    total,
    myReaction: next,
    added,
    targetMemberEmail: reply!.memberEmail,
    bodySnapshot: reply!.body,
    parentPostId: reply!.parentPostId,
  };
}

/**
 * Per-viewer reaction snapshot for a batch of targets. Returns a
 * record keyed by target id: per-key counts + total + the caller's
 * current reaction (null if none).
 */
export async function reactionSnapshots(
  reactorEmail: string,
  targets: ReactionTarget[]
): Promise<Record<string, ReactionSnapshot>> {
  const client = getClient();
  if (!client) return {};
  const norm = normEmail(reactorEmail);
  if (!norm || targets.length === 0) return {};

  const out: Record<string, ReactionSnapshot> = {};
  for (const t of targets) {
    // Skip the HGETALL when the caller already knows this target has
    // no reactions yet — there's nothing to aggregate and the current
    // user can't have a reaction on it either. Saves one Redis call
    // per zero-count target. Big win on a busy feed since most posts
    // never get reacted to. See the 2026-05-18 rate-limit incident.
    if (typeof t.reactionCount === "number" && t.reactionCount === 0) {
      out[t.id] = {
        counts: emptyReactionCounts(),
        total: 0,
        myReaction: null,
      };
      continue;
    }
    const hash = (await client
      .hgetall<Record<string, unknown>>(reactionHashKeyFor(t))
      .catch(() => null)) as Record<string, unknown> | null;
    const { counts, total } = aggregateCounts(hash);
    const mine = hash?.[norm];
    out[t.id] = {
      counts,
      total,
      myReaction: isReactionKey(mine) ? mine : null,
    };
  }
  return out;
}

/* === Pin =================================================== */

export async function setPinned(
  postId: string | null,
  actor: { email: string; firstName: string }
): Promise<{ ok: true; pinnedId: string | null } | { ok: false; error: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const prior = await client.get<string>(PINNED_KEY).catch(() => null);

  if (postId === null) {
    // Unpin.
    if (typeof prior === "string" && prior.length > 0) {
      const old = await getPost(prior);
      if (old) {
        old.pinned = false;
        await writePost(old);
      }
      await client.del(PINNED_KEY);
      await writeModerationEntry({
        ts: Date.now(),
        action: "unpin",
        targetId: prior,
        authorEmail: actor.email,
        authorFirstName: actor.firstName,
        bodySnapshot: old?.body ?? "",
      });
    }
    return { ok: true, pinnedId: null };
  }

  const post = await getPost(postId);
  if (!post || post.deleted) return { ok: false, error: "not_found" };

  // Unpin any prior pinned post (single slot).
  if (typeof prior === "string" && prior.length > 0 && prior !== postId) {
    const old = await getPost(prior);
    if (old) {
      old.pinned = false;
      await writePost(old);
    }
  }

  post.pinned = true;
  await writePost(post);
  await client.set(PINNED_KEY, postId);
  await writeModerationEntry({
    ts: Date.now(),
    action: "pin",
    targetId: postId,
    authorEmail: actor.email,
    authorFirstName: actor.firstName,
    bodySnapshot: post.body,
  });
  return { ok: true, pinnedId: postId };
}

/* === Soft delete =========================================== */

export async function deletePost(
  postId: string,
  actor: { email: string; firstName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const post = await getPost(postId);
  if (!post) return { ok: false, error: "not_found" };
  if (post.deleted) return { ok: true };

  post.deleted = true;
  await writePost(post);
  // Drop from visible feed by removing from the index; the record
  // itself stays for the audit trail / moderation log.
  await client.zrem(POSTS_INDEX, postId);
  // If the deleted post was pinned, unpin it.
  if (post.pinned) {
    await client.del(PINNED_KEY);
  }

  await writeModerationEntry({
    ts: Date.now(),
    action: "delete_post",
    targetId: postId,
    authorEmail: actor.email,
    authorFirstName: actor.firstName,
    bodySnapshot: post.body,
  });
  return { ok: true };
}

export async function deleteReply(
  replyId: string,
  actor: { email: string; firstName: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const reply = await getReply(replyId);
  if (!reply) return { ok: false, error: "not_found" };
  if (reply.deleted) return { ok: true };

  reply.deleted = true;
  await writeReply(reply);
  await client.zrem(
    `${POST_PREFIX}${reply.parentPostId}${POST_REPLIES_SUFFIX}`,
    replyId
  );
  const parent = await getPost(reply.parentPostId);
  if (parent) {
    parent.replyCount = Math.max(0, parent.replyCount - 1);
    await writePost(parent);
  }

  await writeModerationEntry({
    ts: Date.now(),
    action: "delete_reply",
    targetId: replyId,
    targetParentId: reply.parentPostId,
    authorEmail: actor.email,
    authorFirstName: actor.firstName,
    bodySnapshot: reply.body,
  });
  return { ok: true };
}

/* === Active-now presence ===================================
   Lightweight presence signal: which members have rendered the
   Lounge page in the last 5 min. Used to surface a "Clay and X
   others are in the lounge" line at the top. Different from
   last-viewed (which is per-member for NEW-indicator stability)
   — this is a global rolling window. */

export async function bumpActiveNow(
  email: string,
  ms: number = Date.now()
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = normEmail(email);
  if (!norm) return;
  await client
    .zadd(ACTIVE_NOW_KEY, { score: ms, member: norm })
    .catch(() => null);
  // Bound the ZSET — drop entries older than the prune window so
  // it doesn't grow unbounded.
  await client
    .zremrangebyscore(ACTIVE_NOW_KEY, 0, ms - ACTIVE_NOW_PRUNE_AFTER_MS)
    .catch(() => null);
}

export type ActiveNowSnapshot = {
  /** Count of distinct emails active in the window, excluding the
      caller themselves. */
  otherCount: number;
  /** True when an admin-flagged email is in the window (we surface
      the author's presence specifically). */
  authorPresent: boolean;
};

/**
 * Snapshot of who's "in the lounge right now." Filters out the
 * caller. Caller passes the admin-check function so the lib doesn't
 * have to know about admin identity rules.
 */
export async function getActiveNow(
  callerEmail: string,
  isAdminEmail: (email: string) => boolean,
  withinMs: number = ACTIVE_NOW_WINDOW_MS,
  now: number = Date.now()
): Promise<ActiveNowSnapshot> {
  const client = getClient();
  if (!client) return { otherCount: 0, authorPresent: false };
  const caller = normEmail(callerEmail);
  const since = now - withinMs;
  const emailsRaw = (await client
    .zrange(ACTIVE_NOW_KEY, since, now, { byScore: true })
    .catch(() => [] as unknown[])) as unknown[];
  const emails = Array.isArray(emailsRaw)
    ? emailsRaw.filter((v): v is string => typeof v === "string")
    : [];
  let otherCount = 0;
  let authorPresent = false;
  for (const e of emails) {
    if (e === caller) continue;
    if (isAdminEmail(e)) authorPresent = true;
    else otherCount += 1;
  }
  return { otherCount, authorPresent };
}

/* === Last-viewed (drives NEW indicator) ==================== */

export async function getLastViewed(email: string): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client
    .get<number | string>(`${LAST_VIEWED_PREFIX}${normEmail(email)}`)
    .catch(() => null);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function setLastViewed(
  email: string,
  ms: number = Date.now()
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client
    .set(`${LAST_VIEWED_PREFIX}${normEmail(email)}`, ms)
    .catch(() => null);
}

/* === Moderation log ======================================== */

async function writeModerationEntry(entry: ModerationEntry): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.zadd(MODERATION_LOG_KEY, {
    score: entry.ts,
    member: JSON.stringify(entry),
  });
  // Trim to the most recent N entries.
  const total = await client.zcard(MODERATION_LOG_KEY).catch(() => 0);
  if (typeof total === "number" && total > MODERATION_LOG_TRIM) {
    await client
      .zremrangebyrank(MODERATION_LOG_KEY, 0, total - MODERATION_LOG_TRIM - 1)
      .catch(() => null);
  }
}

export async function listModerationLog(
  limit = 100
): Promise<ModerationEntry[]> {
  const client = getClient();
  if (!client) return [];
  const raw = (await client
    .zrange(MODERATION_LOG_KEY, 0, limit - 1, { rev: true })
    .catch(() => [] as unknown[])) as unknown[];
  const out: ModerationEntry[] = [];
  for (const item of raw) {
    try {
      const parsed =
        typeof item === "string"
          ? (JSON.parse(item) as ModerationEntry)
          : (item as ModerationEntry);
      if (parsed && typeof parsed.ts === "number") out.push(parsed);
    } catch {
      // Skip malformed.
    }
  }
  return out;
}

/* === Read-by-Clay receipts ================================== */

export type ReadByClayTarget = { kind: "post" | "reply"; id: string };

function readByClayKeyFor(kind: "post" | "reply"): string {
  return kind === "post" ? READ_BY_CLAY_POSTS_KEY : READ_BY_CLAY_REPLIES_KEY;
}

/**
 * Mark a post or reply as read by Clay (or clear the mark). Idempotent
 * on both directions. Returns the resulting state so the caller can
 * confirm without a follow-up read.
 */
export async function setReadByClay(
  target: ReadByClayTarget,
  read: boolean
): Promise<{ ok: true; read: boolean } | { ok: false; error: "storage_unavailable" }> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const key = readByClayKeyFor(target.kind);
  if (read) {
    await client.sadd(key, target.id);
  } else {
    await client.srem(key, target.id);
  }
  return { ok: true, read };
}

/**
 * Filter the given ids down to the subset that's been marked read.
 * Uses SMISMEMBER so even a long candidate list is one round-trip.
 * Returns an empty Set when storage is unavailable so the caller's
 * render path stays clean (no read-by-Clay receipts shown, but no
 * exception either).
 */
async function readByClaySubset(
  kind: "post" | "reply",
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const client = getClient();
  if (!client) return new Set();
  const key = readByClayKeyFor(kind);
  // smismember returns a 0/1 array aligned to the input ids.
  const flags = (await client
    .smismember(key, ids)
    .catch(() => [] as number[])) as unknown as number[];
  const out = new Set<string>();
  ids.forEach((id, i) => {
    if (flags[i] === 1) out.add(id);
  });
  return out;
}

export function getReadByClayPostIds(ids: string[]): Promise<Set<string>> {
  return readByClaySubset("post", ids);
}

export function getReadByClayReplyIds(ids: string[]): Promise<Set<string>> {
  return readByClaySubset("reply", ids);
}
