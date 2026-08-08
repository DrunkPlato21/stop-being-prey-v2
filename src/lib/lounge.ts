import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { getProfilesByEmails } from "./comments";
import { extractYouTubeId } from "./youtube";

// The Lounge: member-to-member async discussion. Short posts (≤500),
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
// Floor for the member-facing "who's in the room" indicator. The
// count + names line only renders once at least this many people are
// in the active-now window — so a thin room never shows an
// embarrassing number. Admin-tunable; raise it past any plausible
// turnout to effectively hide the line.
const ROOM_PRESENCE_FLOOR_KEY = "lounge:presence:floor";
export const DEFAULT_ROOM_PRESENCE_FLOOR = 4;
// Arrivals log — drives the live "just walked in" ticker in the Watch
// Feed Wire. We log an entry only when a member re-enters the room
// after being absent (not on every heartbeat), so it reads as real
// foot traffic. Short eligibility window; bounded retention.
const ARRIVALS_KEY = "lounge:arrivals";
const ARRIVALS_WINDOW_MS = 3 * 60 * 1000;
const ARRIVALS_PRUNE_AFTER_MS = 30 * 60 * 1000;
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

// Cap members must stay under. Admin (Clay) gets a higher hard cap of
// MAX_BODY_ADMIN — the compose UI shows a warning when he crosses
// MAX_BODY but still accepts the post up to the admin cap.
export const MAX_BODY = 500;
export const MAX_BODY_ADMIN = 1500;
// Short cooldowns to catch accidental double-submits and basic
// scripts. No daily caps — trust the membership.
export const POST_COOLDOWN_MS = 60_000;
export const REPLY_COOLDOWN_MS = 30_000;
// How long after posting a member may edit or delete their own post or
// reply. Flat window from createdAt; admin bypasses it. The client uses
// the same value to show/hide the affordances, but the server is the
// authority — every edit/delete re-checks this here.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
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
  "cry",
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
  cry: "😢",
  hundred: "💯",
};

export const REACTION_LABEL: Record<ReactionKey, string> = {
  like: "Like",
  love: "Love",
  fire: "Fire",
  laugh: "Laugh",
  wow: "Wow",
  cry: "Cry",
  hundred: "Hundred",
};

export type ReactionCounts = Record<ReactionKey, number>;

export function emptyReactionCounts(): ReactionCounts {
  return { like: 0, love: 0, fire: 0, laugh: 0, wow: 0, cry: 0, hundred: 0 };
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
  /** Optional image or YouTube embed (one per post). Absent on legacy
      records and text-only posts. */
  media?: LoungeMedia | null;
  /** Total across all reaction keys. Denormalized for fast feed
      rendering; per-key breakdown derived from the reactions hash. */
  reactionCount: number;
  replyCount: number;
  /** When the author last edited the body, or null if never edited.
      Drives the "edited" marker in the UI. Editing intentionally does
      NOT bump lastActivityAt — a typo fix shouldn't re-float the post. */
  editedAt: number | null;
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
  /** See LoungePost.editedAt. */
  editedAt: number | null;
  /** Optional attached image, same as a post. Image only (no YouTube embed
      on replies). Absent on legacy records and text-only replies. */
  media?: LoungeImageMedia | null;
};

// One media item per post. An image lives in our own Vercel Blob store
// (the client downscales + re-encodes to WebP before upload); a YouTube
// embed is just the validated 11-char video id (the player is built from
// it client-side, click-to-play). No arbitrary embeds — that's the
// security + tidiness line.
export type LoungeImageMedia = {
  type: "image";
  url: string;
  width: number;
  height: number;
};
export type LoungeYouTubeMedia = { type: "youtube"; videoId: string };
export type LoungeMedia = LoungeImageMedia | LoungeYouTubeMedia;

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

function sanitizeBody(input: string, maxLen: number = MAX_BODY): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLen);
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
    // Backfill editedAt on records written before the edit-window
    // feature — they were never edited, so null is correct.
    const editedAt =
      typeof parsed.editedAt === "number" ? parsed.editedAt : null;
    return { ...(parsed as LoungePost), lastActivityAt, editedAt };
  } catch {
    return null;
  }
}

function parseReply(raw: unknown): LoungeReply | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<LoungeReply>)
        : (raw as Partial<LoungeReply>);
    if (typeof parsed.id !== "string") return null;
    // Backfill editedAt for pre-edit-window records (see parsePost).
    const editedAt =
      typeof parsed.editedAt === "number" ? parsed.editedAt : null;
    return { ...(parsed as LoungeReply), editedAt };
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
  /** Raw client-supplied media descriptor. Validated in createPost — an
      image must point at our own Blob store; YouTube is re-derived from
      the body server-side, never trusted from the client. */
  media?: unknown;
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

// Only accept an image whose URL lives in our own Vercel Blob store, so
// a forged client payload can't make us render (or hotlink) an arbitrary
// external URL. Dimensions come from the client's canvas resize and just
// drive layout, so they're sanity-bounded, not trusted precisely.
const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i;
const MAX_MEDIA_DIM = 5000;

function validateImageMedia(raw: unknown): LoungeImageMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== "image") return null;
  const url = typeof m.url === "string" ? m.url : "";
  const w = typeof m.width === "number" ? m.width : 0;
  const h = typeof m.height === "number" ? m.height : 0;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!BLOB_HOST_RE.test(host)) return null;
  if (!(w > 0 && w <= MAX_MEDIA_DIM && h > 0 && h <= MAX_MEDIA_DIM)) return null;
  return { type: "image", url, width: Math.round(w), height: Math.round(h) };
}

export async function createPost(
  input: CreatePostInput
): Promise<CreatePostResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const body = sanitizeBody(
    input.body,
    input.isAdmin ? MAX_BODY_ADMIN : MAX_BODY
  );

  // One media item per post: an uploaded image wins; otherwise a YouTube
  // link in the body becomes a click-to-play embed (derived here, never
  // trusted from the client). A post may be media-only (empty body).
  let media: LoungeMedia | null = validateImageMedia(input.media);
  if (!media) {
    const ytId = extractYouTubeId(body);
    if (ytId) media = { type: "youtube", videoId: ytId };
  }
  if (!body && !media) return { ok: false, error: "empty_body" };

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
    editedAt: null,
    media,
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

/**
 * Per-member rolling-24h cap on image uploads. Cheap backstop so a member
 * can't quietly run up Blob storage by uploading without ever posting.
 * Returns true when still under the cap (i.e. the upload may proceed).
 */
const UPLOAD_DAILY_CAP = 30;
export async function checkUploadQuota(email: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const key = `lounge:uploads:${normEmail(email)}`;
  const n = await client.incr(key);
  if (n === 1) await client.expire(key, 86400);
  return n <= UPLOAD_DAILY_CAP;
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

/**
 * Posts created since `sinceMs` — the weekly digest's Lounge pulse.
 * Counts top-level posts only (replies live in per-post zsets and a
 * one-line stat isn't worth N round-trips). Counts straight off the
 * index, so hidden posts are included; as a pulse number, close
 * enough is correct enough.
 */
export async function countPostsSince(sinceMs: number): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const n = await client.zcount(POSTS_INDEX, sinceMs, "+inf").catch(() => 0);
  return typeof n === "number" ? n : 0;
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
  /** Raw client-supplied image descriptor. Validated in createReply against
      our own Blob store, same as a post. */
  media?: unknown;
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
  const body = sanitizeBody(
    input.body,
    input.isAdmin ? MAX_BODY_ADMIN : MAX_BODY
  );
  // A reply may be text, an image, or both — but not empty. Image must point
  // at our own Blob store (validateImageMedia); no YouTube embeds on replies.
  const media = validateImageMedia(input.media);
  if (!body && !media) return { ok: false, error: "empty_body" };

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
    editedAt: null,
    media,
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

/**
 * The newest non-deleted reply on a post, or null if there are none.
 * Reads only a short newest tail of the (createdAt-scored) replies index
 * so a just-deleted newest reply falls through to the next live one
 * without pulling the whole set. This runs on the frequently-polled Desk
 * peek, so it stays cheap on Redis. Mirrors guild.ts getLatestReply.
 */
export async function getLatestReply(
  postId: string
): Promise<LoungeReply | null> {
  const client = getClient();
  if (!client) return null;
  // Negative indices = the highest-scored (newest) members, ascending.
  const idsRaw = (await client
    .zrange(`${POST_PREFIX}${postId}${POST_REPLIES_SUFFIX}`, -6, -1)
    .catch(() => [] as unknown[])) as string[];
  const ids = Array.isArray(idsRaw) ? idsRaw : [];
  if (ids.length === 0) return null;
  // Walk newest-first; return the first one that isn't a tombstone.
  for (let i = ids.length - 1; i >= 0; i--) {
    const reply = await getReply(ids[i]);
    if (reply && !reply.deleted) return reply;
  }
  return null;
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

/** Who reacted to one target, and with what. Emails only; the caller
    resolves display names. Used by the "see who reacted" popover. */
export async function getLoungeReactors(
  target: ReactionTarget
): Promise<Array<{ email: string; reaction: ReactionKey }>> {
  const client = getClient();
  if (!client) return [];
  const hash = await client
    .hgetall<Record<string, unknown>>(reactionHashKeyFor(target))
    .catch(() => null);
  if (!hash) return [];
  const out: Array<{ email: string; reaction: ReactionKey }> = [];
  for (const [email, value] of Object.entries(hash)) {
    if (isReactionKey(value)) out.push({ email, reaction: value });
  }
  return out;
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

/* === Member self-service: edit + delete own ================
   Members may edit or delete their OWN post/reply for EDIT_WINDOW_MS
   after posting. Admin bypasses both the ownership check and the
   window (he can already moderate anything). The window is enforced
   here, server-side, regardless of what the client shows. Editing
   updates the body + stamps editedAt; it does NOT touch
   lastActivityAt or the feed index, so a fix never re-floats a post. */

type ModifyGuard =
  | { ok: true }
  | { ok: false; error: "not_found" | "forbidden" | "window_closed" };

function checkMemberModify(opts: {
  recordEmail: string;
  createdAt: number;
  deleted: boolean;
  actorEmail: string;
  isAdmin: boolean;
  now: number;
}): ModifyGuard {
  if (opts.deleted) return { ok: false, error: "not_found" };
  if (opts.isAdmin) return { ok: true };
  if (normEmail(opts.recordEmail) !== normEmail(opts.actorEmail)) {
    return { ok: false, error: "forbidden" };
  }
  if (opts.now - opts.createdAt > EDIT_WINDOW_MS) {
    return { ok: false, error: "window_closed" };
  }
  return { ok: true };
}

export type EditResult =
  | { ok: true; body: string; editedAt: number }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "not_found"
        | "forbidden"
        | "window_closed"
        | "empty_body";
    };

export async function editPost(
  postId: string,
  actor: { email: string; isAdmin: boolean },
  newBody: string
): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const post = await getPost(postId);
  if (!post) return { ok: false, error: "not_found" };
  const now = Date.now();
  const guard = checkMemberModify({
    recordEmail: post.memberEmail,
    createdAt: post.createdAt,
    deleted: post.deleted,
    actorEmail: actor.email,
    isAdmin: actor.isAdmin,
    now,
  });
  if (!guard.ok) return guard;

  const body = sanitizeBody(newBody, actor.isAdmin ? MAX_BODY_ADMIN : MAX_BODY);
  if (!body) return { ok: false, error: "empty_body" };

  post.body = body;
  post.editedAt = now;
  await writePost(post);
  return { ok: true, body, editedAt: now };
}

export async function editReply(
  replyId: string,
  actor: { email: string; isAdmin: boolean },
  newBody: string
): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const reply = await getReply(replyId);
  if (!reply) return { ok: false, error: "not_found" };
  const now = Date.now();
  const guard = checkMemberModify({
    recordEmail: reply.memberEmail,
    createdAt: reply.createdAt,
    deleted: reply.deleted,
    actorEmail: actor.email,
    isAdmin: actor.isAdmin,
    now,
  });
  if (!guard.ok) return guard;

  const body = sanitizeBody(newBody, actor.isAdmin ? MAX_BODY_ADMIN : MAX_BODY);
  if (!body) return { ok: false, error: "empty_body" };

  reply.body = body;
  reply.editedAt = now;
  await writeReply(reply);
  return { ok: true, body, editedAt: now };
}

export type MemberDeleteResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "not_found"
        | "forbidden"
        | "window_closed";
    };

/**
 * Member-initiated delete of their own post/reply. Guards ownership +
 * the edit window, then reuses the same soft-delete path the admin
 * uses (index removal, pin clearing, moderation-log entry). The actor
 * recorded in the moderation log is the member themselves.
 */
export async function memberDeletePost(
  postId: string,
  actor: { email: string; firstName: string; isAdmin: boolean }
): Promise<MemberDeleteResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const post = await getPost(postId);
  if (!post) return { ok: false, error: "not_found" };
  if (post.deleted) return { ok: true };
  const guard = checkMemberModify({
    recordEmail: post.memberEmail,
    createdAt: post.createdAt,
    deleted: post.deleted,
    actorEmail: actor.email,
    isAdmin: actor.isAdmin,
    now: Date.now(),
  });
  if (!guard.ok) return guard;
  const res = await deletePost(postId, {
    email: actor.email,
    firstName: actor.firstName,
  });
  return res.ok ? { ok: true } : { ok: false, error: "storage_unavailable" };
}

export async function memberDeleteReply(
  replyId: string,
  actor: { email: string; firstName: string; isAdmin: boolean }
): Promise<MemberDeleteResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const reply = await getReply(replyId);
  if (!reply) return { ok: false, error: "not_found" };
  if (reply.deleted) return { ok: true };
  const guard = checkMemberModify({
    recordEmail: reply.memberEmail,
    createdAt: reply.createdAt,
    deleted: reply.deleted,
    actorEmail: actor.email,
    isAdmin: actor.isAdmin,
    now: Date.now(),
  });
  if (!guard.ok) return guard;
  const res = await deleteReply(replyId, {
    email: actor.email,
    firstName: actor.firstName,
  });
  return res.ok ? { ok: true } : { ok: false, error: "storage_unavailable" };
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

  // Was this member already in the active window? If not, this bump is
  // a fresh arrival worth announcing. Checked before the zadd below
  // overwrites the prior score.
  const priorRaw = await client.zscore(ACTIVE_NOW_KEY, norm).catch(() => null);
  const prior =
    typeof priorRaw === "number"
      ? priorRaw
      : typeof priorRaw === "string"
        ? Number(priorRaw)
        : NaN;
  const wasPresent = Number.isFinite(prior) && prior >= ms - ACTIVE_NOW_WINDOW_MS;

  await client
    .zadd(ACTIVE_NOW_KEY, { score: ms, member: norm })
    .catch(() => null);
  // Bound the ZSET — drop entries older than the prune window so
  // it doesn't grow unbounded.
  await client
    .zremrangebyscore(ACTIVE_NOW_KEY, 0, ms - ACTIVE_NOW_PRUNE_AFTER_MS)
    .catch(() => null);

  if (!wasPresent) {
    // Member string carries the timestamp so re-arrivals stay distinct
    // entries (a ZSET member must be unique).
    await client
      .zadd(ARRIVALS_KEY, { score: ms, member: `${ms}|${norm}` })
      .catch(() => null);
    await client
      .zremrangebyscore(ARRIVALS_KEY, 0, ms - ARRIVALS_PRUNE_AFTER_MS)
      .catch(() => null);
  }
}

export type Arrival = {
  email: string;
  name: string;
  at: number;
};

/**
 * Recent lounge arrivals for the live "just walked in" ticker, newest
 * first. Deduped by member (latest arrival wins) so a flaky tab that
 * re-enters a few times doesn't spam the wire. Names resolve from
 * profiles in one batched call.
 */
export async function listRecentArrivals(opts?: {
  withinMs?: number;
  now?: number;
  excludeEmail?: string;
  limit?: number;
}): Promise<Arrival[]> {
  const client = getClient();
  if (!client) return [];
  const now = opts?.now ?? Date.now();
  const within = opts?.withinMs ?? ARRIVALS_WINDOW_MS;
  const limit = opts?.limit ?? 8;
  const exclude = opts?.excludeEmail ? normEmail(opts.excludeEmail) : null;

  const raw = (await client
    .zrange(ARRIVALS_KEY, now - within, now, {
      byScore: true,
      withScores: true,
    })
    .catch(() => [] as unknown[])) as Array<string | number>;

  // Newest first, deduped by email.
  const seen = new Set<string>();
  const ordered: Arrival[] = [];
  for (let i = raw.length - 2; i >= 0; i -= 2) {
    const member = raw[i];
    const at = Number(raw[i + 1]);
    if (typeof member !== "string" || !Number.isFinite(at)) continue;
    const sep = member.indexOf("|");
    const email = sep >= 0 ? member.slice(sep + 1) : member;
    if (!email || seen.has(email)) continue;
    if (exclude && email === exclude) continue;
    seen.add(email);
    ordered.push({ email, name: "", at });
    if (ordered.length >= limit) break;
  }
  if (ordered.length === 0) return [];

  const profiles = await getProfilesByEmails(
    ordered.map((a) => a.email)
  ).catch(() => null);
  for (const a of ordered) {
    const dn = profiles?.get(a.email)?.displayName?.trim();
    a.name = dn && dn.length > 0 ? dn : a.email.split("@")[0] || a.email;
  }
  return ordered;
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

/* === Room presence (count + names, floor-gated) ============
   Richer cousin of getActiveNow used by the member-facing "who's in
   the room" indicator. Returns the total in the active-now window
   plus the display names of everyone other than the viewer (newest
   first), so the line can read "6 in the room · Janet, Mike, Trish
   +2." Names resolve from member profiles in one batched MGET. */

export type RoomPresence = {
  /** Everyone in the active-now window, the viewer included. */
  total: number;
  /** Display names of everyone other than the viewer, newest-first. */
  names: string[];
};

export async function getRoomPresence(opts: {
  viewerEmail: string;
  /** When set, skip the (pricier) name lookup and return names: [] if
      the total is below the floor. The caller hides the line anyway,
      so there's no point resolving profiles on a quiet room. */
  floor?: number;
  withinMs?: number;
  now?: number;
}): Promise<RoomPresence> {
  const client = getClient();
  if (!client) return { total: 0, names: [] };
  const now = opts.now ?? Date.now();
  const within = opts.withinMs ?? ACTIVE_NOW_WINDOW_MS;
  const since = now - within;

  const raw = (await client
    .zrange(ACTIVE_NOW_KEY, since, now, { byScore: true, withScores: true })
    .catch(() => [] as unknown[])) as Array<string | number>;
  const ranked: Array<{ email: string; at: number }> = [];
  for (let i = 0; i < raw.length; i += 2) {
    const email = raw[i];
    const at = Number(raw[i + 1]);
    if (typeof email === "string" && Number.isFinite(at)) {
      ranked.push({ email, at });
    }
  }

  const total = ranked.length;
  if (typeof opts.floor === "number" && total < opts.floor) {
    return { total, names: [] };
  }
  const viewer = normEmail(opts.viewerEmail);
  const others = ranked
    .filter((r) => r.email !== viewer)
    .sort((a, b) => b.at - a.at)
    .map((r) => r.email);
  if (others.length === 0) return { total, names: [] };

  const profiles = await getProfilesByEmails(others).catch(() => null);
  const names = others.map((email) => {
    const dn = profiles?.get(email)?.displayName?.trim();
    return dn && dn.length > 0 ? dn : email.split("@")[0] || email;
  });
  return { total, names };
}

/**
 * Cheap headcount of everyone in the active-now window — no name
 * lookups. Used by the Wire's "N in the room" ticker item, which polls
 * often, so it stays a single ZCOUNT.
 */
export async function countRoomPresence(
  now: number = Date.now()
): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const since = now - ACTIVE_NOW_WINDOW_MS;
  const n = await client.zcount(ACTIVE_NOW_KEY, since, now).catch(() => 0);
  return typeof n === "number" ? n : 0;
}

/** Current admin-set floor for the room-presence indicator. */
export async function getRoomPresenceFloor(): Promise<number> {
  const client = getClient();
  if (!client) return DEFAULT_ROOM_PRESENCE_FLOOR;
  const raw = await client
    .get<number | string>(ROOM_PRESENCE_FLOOR_KEY)
    .catch(() => null);
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROOM_PRESENCE_FLOOR;
}

/** Persist a new floor (clamped to 1..999). Returns the stored value. */
export async function setRoomPresenceFloor(value: number): Promise<number> {
  const clamped = Math.max(1, Math.min(999, Math.round(value)));
  const client = getClient();
  if (!client) return clamped;
  await client.set(ROOM_PRESENCE_FLOOR_KEY, clamped).catch(() => null);
  return clamped;
}

/* === Scheduled prompts (conversation starters + drip) ======
   A queue of host prompts that surface as real lounge posts on a
   schedule — the first as a pinned conversation starter, the rest
   dripping in over the night to keep the room sparked while Clay is
   heads-down. Stored as a ZSET scored by reveal time; each member is
   the JSON-encoded prompt so a ZREM is an atomic claim. There's no
   cron: reveal is driven by lounge traffic (the GET poll), and the
   atomic claim guarantees a due prompt posts exactly once even when
   many members poll at the same instant. If nobody's in the room,
   nothing fires — which is fine, there's no one to spark. */

const PROMPTS_QUEUE_KEY = "lounge:prompts:queue";

export type ScheduledPrompt = {
  id: string;
  text: string;
  /** Pin the post to the top of the lounge on reveal. */
  pin: boolean;
  /** Epoch ms when the prompt should post. */
  revealAt: number;
};

function promptMember(p: { id: string; text: string; pin: boolean }): string {
  // Stable key order so listScheduledPrompts can reconstruct the exact
  // member string for a targeted ZREM.
  return JSON.stringify({ id: p.id, text: p.text, pin: p.pin });
}

/** Queue prompts for future reveal. Returns how many were stored. */
export async function enqueuePrompts(
  prompts: Array<{ text: string; revealAt: number; pin?: boolean }>
): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  let stored = 0;
  for (const p of prompts) {
    const text = sanitizeBody(p.text, MAX_BODY_ADMIN);
    if (!text) continue;
    const member = promptMember({
      id: randomUUID(),
      text,
      pin: !!p.pin,
    });
    await client
      .zadd(PROMPTS_QUEUE_KEY, { score: p.revealAt, member })
      .catch(() => null);
    stored += 1;
  }
  return stored;
}

/** All still-pending prompts, soonest first. */
export async function listScheduledPrompts(): Promise<ScheduledPrompt[]> {
  const client = getClient();
  if (!client) return [];
  const raw = (await client
    .zrange(PROMPTS_QUEUE_KEY, 0, -1, { withScores: true })
    .catch(() => [] as unknown[])) as Array<string | number>;
  const out: ScheduledPrompt[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const member = raw[i];
    const score = Number(raw[i + 1]);
    if (typeof member !== "string" || !Number.isFinite(score)) continue;
    try {
      const p = JSON.parse(member) as Partial<ScheduledPrompt>;
      if (typeof p.text === "string" && p.text.length > 0) {
        out.push({
          id: typeof p.id === "string" ? p.id : "",
          text: p.text,
          pin: !!p.pin,
          revealAt: score,
        });
      }
    } catch {
      // Skip malformed.
    }
  }
  out.sort((a, b) => a.revealAt - b.revealAt);
  return out;
}

/** Drop the whole queue (admin "clear scheduled" action). */
export async function clearScheduledPrompts(): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.del(PROMPTS_QUEUE_KEY).catch(() => null);
}

/**
 * Post any prompts whose reveal time has passed, as host-authored
 * lounge posts. Atomic per-prompt claim (ZREM) means concurrent polls
 * can't double-post. Returns the number actually posted by this call.
 */
export async function revealDuePrompts(opts: {
  hostEmail: string;
  now?: number;
}): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const now = opts.now ?? Date.now();
  const dueRaw = (await client
    .zrange(PROMPTS_QUEUE_KEY, 0, now, { byScore: true })
    .catch(() => [] as unknown[])) as unknown[];
  const due = Array.isArray(dueRaw)
    ? dueRaw.filter((v): v is string => typeof v === "string")
    : [];
  if (due.length === 0) return 0;

  // Resolve the host's display name once, and only now that there's
  // something to post — keeps the per-poll cost at a single empty
  // ZRANGE on a quiet queue.
  const hostEmail = normEmail(opts.hostEmail);
  const profiles = await getProfilesByEmails([hostEmail]).catch(() => null);
  const displayName = profiles?.get(hostEmail)?.displayName?.trim();
  const hostFirstName =
    (displayName && displayName.split(/\s+/)[0]) ||
    hostEmail.split("@")[0] ||
    "Host";

  let created = 0;
  for (const member of due) {
    // Atomic claim — only the poll that removes the member posts it.
    const claimed = await client
      .zrem(PROMPTS_QUEUE_KEY, member)
      .catch(() => 0);
    if (claimed !== 1) continue;

    let parsed: Partial<ScheduledPrompt>;
    try {
      parsed = JSON.parse(member) as Partial<ScheduledPrompt>;
    } catch {
      continue;
    }
    if (typeof parsed.text !== "string" || !parsed.text) continue;

    const res = await createPost({
      memberEmail: hostEmail,
      firstName: hostFirstName,
      isFounder: false,
      body: parsed.text,
      isAdmin: true,
    });
    if (res.ok) {
      created += 1;
      if (parsed.pin) {
        await setPinned(res.post.id, {
          email: hostEmail,
          firstName: hostFirstName,
        }).catch(() => null);
      }
    }
  }
  return created;
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
