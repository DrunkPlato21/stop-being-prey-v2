import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import {
  EDIT_WINDOW_MS,
  MAX_BODY,
  MAX_REPLY,
  MAX_TITLE,
} from "./guild-constants";

// The Guild — a member-initiated, topic-organized library of substantive
// titled threads. NOT the Lounge (a recency-ordered chat river) and NOT
// article comments (responses to Clay's published pieces). The Guild is
// its own category: threads persist and accumulate, a great thread is
// still the home for its topic a month later. Clay presides — he pins the
// Question of the Week and marks threads/replies as read, his attention
// being the coveted currency. Members start the threads; the best rises
// and lasts by his curation, not by votes (no reactions/karma in v1).
//
// Storage is dev-namespaced from day one (see KEY_PREFIX) so local
// testing with `npm run dev` never writes into the production keyspace —
// a deliberate departure from the Lounge, which writes unprefixed.

// --------------------------------------------------------------------
// Keyspace
// --------------------------------------------------------------------

// Same shape as src/lib/coins.ts: an explicit override wins; otherwise
// production (NODE_ENV=production on Vercel) uses no prefix and every
// other environment is pushed into a `dev:` keyspace the live site never
// reads. Keys off NODE_ENV, so test with `npm run dev` (development), NOT
// `npm run build && start` (production), which would hit the real keys.
const KEY_PREFIX =
  process.env.GUILD_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

// ZSET of every live thread id, score = lastActivityAt. Powers the
// "recent / active" index so the room reads alive on arrival.
const THREADS_INDEX = `${KEY_PREFIX}guild:threads`;
const THREAD_PREFIX = `${KEY_PREFIX}guild:thread:`;
// Per-thread ZSET of reply ids, score = createdAt (chronological). The
// reply tree is built in memory from this flat set on read.
const repliesIndexKey = (threadId: string) =>
  `${THREAD_PREFIX}${threadId}:replies`;
const REPLY_PREFIX = `${KEY_PREFIX}guild:reply:`;
// Single pinned thread id (the Question of the Week). Absent when nothing
// is pinned. One at a time, like the Lounge's pinned post.
const PINNED_KEY = `${KEY_PREFIX}guild:pinned`;
// Per-(member, action) cooldown locks. SET NX EX; presence = rate limited.
const RATELIMIT_PREFIX = `${KEY_PREFIX}guild:ratelimit:`;

/** True when Guild writes land in the production keyspace (no prefix). */
export function isGuildProduction(): boolean {
  return KEY_PREFIX === "";
}

// --------------------------------------------------------------------
// Limits
// --------------------------------------------------------------------

// Limits + edit window live in guild-constants.ts (no server deps) so
// client composers can import them; re-exported here for lib consumers.
export { EDIT_WINDOW_MS, MAX_BODY, MAX_REPLY, MAX_TITLE };

// Light anti-flood cooldowns. Friction kills community, so these are
// generous — they exist to stop the first spammer flooding the library,
// not to pace genuine conversation.
const THREAD_COOLDOWN_SECONDS = 90;
const REPLY_COOLDOWN_SECONDS = 15;

// --------------------------------------------------------------------
// Types
// --------------------------------------------------------------------

export type GuildThread = {
  id: string;
  authorEmail: string;
  title: string;
  body: string;
  createdAt: number;
  editedAt: number | null;
  // Bumped to the newest reply's createdAt so the active index surfaces
  // threads with live conversation. Equals createdAt for a fresh thread.
  lastActivityAt: number;
  // Count of non-deleted replies. Maintained on create/delete so the
  // index can show "N replies" without fetching every reply.
  replyCount: number;
  pinned: boolean;
  // When Clay marked this thread read. null = unseen by the king.
  clayReadAt: number | null;
  deleted: boolean;
};

export type GuildReply = {
  id: string;
  threadId: string;
  // null = a top-level reply to the thread. Otherwise the reply this is
  // nested under. The page caps visual depth at two levels.
  parentReplyId: string | null;
  authorEmail: string;
  body: string;
  createdAt: number;
  editedAt: number | null;
  clayReadAt: number | null;
  deleted: boolean;
};

// --------------------------------------------------------------------
// Client
// --------------------------------------------------------------------

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isGuildConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function parse<T>(raw: unknown): T | null {
  if (raw == null) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------

/**
 * Returns true when the action is allowed (and claims the cooldown), false
 * when the member is still within the cooldown window. Fails open if Redis
 * is unavailable — a missing store should never block posting.
 */
async function claimCooldown(
  email: string,
  action: "thread" | "reply",
  seconds: number
): Promise<boolean> {
  const client = getClient();
  if (!client) return true;
  const key = `${RATELIMIT_PREFIX}${action}:${normEmail(email)}`;
  // SET NX EX: only sets when absent; presence means "still cooling down".
  const ok = await client.set(key, "1", { nx: true, ex: seconds });
  return ok === "OK";
}

// --------------------------------------------------------------------
// Threads
// --------------------------------------------------------------------

export type CreateThreadResult =
  | { ok: true; thread: GuildThread }
  | { ok: false; error: "storage_unavailable" | "rate_limited" | "invalid" };

export async function createThread(args: {
  authorEmail: string;
  title: string;
  body: string;
}): Promise<CreateThreadResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const title = args.title.trim().slice(0, MAX_TITLE);
  const body = args.body.trim().slice(0, MAX_BODY);
  if (!title || !body) return { ok: false, error: "invalid" };

  if (!(await claimCooldown(args.authorEmail, "thread", THREAD_COOLDOWN_SECONDS))) {
    return { ok: false, error: "rate_limited" };
  }

  const now = Date.now();
  const thread: GuildThread = {
    id: randomUUID(),
    authorEmail: normEmail(args.authorEmail),
    title,
    body,
    createdAt: now,
    editedAt: null,
    lastActivityAt: now,
    replyCount: 0,
    pinned: false,
    clayReadAt: null,
    deleted: false,
  };
  await client.set(`${THREAD_PREFIX}${thread.id}`, JSON.stringify(thread));
  await client.zadd(THREADS_INDEX, { score: now, member: thread.id });
  return { ok: true, thread };
}

export async function getThread(id: string): Promise<GuildThread | null> {
  const client = getClient();
  if (!client) return null;
  return parse<GuildThread>(await client.get(`${THREAD_PREFIX}${id}`));
}

export type ThreadPage = { threads: GuildThread[]; hasMore: boolean };

/**
 * The active index: live threads ordered by latest activity, newest
 * first. The pinned thread is fetched separately by the page and shown
 * above this list, so it's filtered out here to avoid a duplicate.
 * Deleted threads are dropped. `before` is a lastActivityAt cursor for
 * "load older" (calm pagination, not infinite scroll).
 */
export async function listActiveThreads(args?: {
  limit?: number;
  before?: number;
}): Promise<ThreadPage> {
  const client = getClient();
  if (!client) return { threads: [], hasMore: false };
  const limit = args?.limit ?? 25;

  // Pull limit+1 to detect hasMore, newest activity first. Mirrors the
  // lounge feed: a by-rank read for the first page, a by-score read past
  // a cursor for "load older".
  let ids: string[];
  if (typeof args?.before === "number" && Number.isFinite(args.before)) {
    ids = (await client
      .zrange(THREADS_INDEX, args.before - 1, "-inf", {
        byScore: true,
        rev: true,
        offset: 0,
        count: limit + 1,
      })
      .catch(() => [] as unknown[])) as string[];
  } else {
    ids = (await client
      .zrange(THREADS_INDEX, 0, limit, { rev: true })
      .catch(() => [] as unknown[])) as string[];
  }
  if (!ids.length) return { threads: [], hasMore: false };

  const hasMore = ids.length > limit;
  const pageIds = hasMore ? ids.slice(0, limit) : ids;
  const raw = await client.mget<(string | null)[]>(
    ...pageIds.map((id) => `${THREAD_PREFIX}${id}`)
  );
  const threads = raw
    .map((r) => parse<GuildThread>(r))
    .filter((t): t is GuildThread => !!t && !t.deleted && !t.pinned);
  return { threads, hasMore };
}

export async function getPinnedThread(): Promise<GuildThread | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(PINNED_KEY);
  if (!id) return null;
  const thread = await getThread(id);
  if (!thread || thread.deleted) return null;
  return thread;
}

// --------------------------------------------------------------------
// Replies
// --------------------------------------------------------------------

export type CreateReplyResult =
  | { ok: true; reply: GuildReply }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "rate_limited"
        | "invalid"
        | "thread_missing";
    };

export async function createReply(args: {
  authorEmail: string;
  threadId: string;
  parentReplyId: string | null;
  body: string;
}): Promise<CreateReplyResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const body = args.body.trim().slice(0, MAX_REPLY);
  if (!body) return { ok: false, error: "invalid" };

  const thread = await getThread(args.threadId);
  if (!thread || thread.deleted) return { ok: false, error: "thread_missing" };

  // If replying under another reply, flatten beyond two visual levels:
  // a reply to a depth-1 reply re-parents to that reply (depth stays 1),
  // which the page renders as a single nested tier. We only need to
  // guarantee the parent exists and belongs to this thread.
  let parentReplyId = args.parentReplyId;
  if (parentReplyId) {
    const parent = await getReply(parentReplyId);
    if (!parent || parent.threadId !== args.threadId || parent.deleted) {
      parentReplyId = null;
    } else if (parent.parentReplyId) {
      // Grandchild — re-parent up one so nesting never exceeds two tiers.
      parentReplyId = parent.parentReplyId;
    }
  }

  if (!(await claimCooldown(args.authorEmail, "reply", REPLY_COOLDOWN_SECONDS))) {
    return { ok: false, error: "rate_limited" };
  }

  const now = Date.now();
  const reply: GuildReply = {
    id: randomUUID(),
    threadId: args.threadId,
    parentReplyId,
    authorEmail: normEmail(args.authorEmail),
    body,
    createdAt: now,
    editedAt: null,
    clayReadAt: null,
    deleted: false,
  };
  await client.set(`${REPLY_PREFIX}${reply.id}`, JSON.stringify(reply));
  await client.zadd(repliesIndexKey(args.threadId), {
    score: now,
    member: reply.id,
  });

  // Bump the thread's activity + reply count and re-score the index so
  // the thread floats to the top of the active list.
  thread.replyCount += 1;
  thread.lastActivityAt = now;
  await client.set(`${THREAD_PREFIX}${thread.id}`, JSON.stringify(thread));
  await client.zadd(THREADS_INDEX, { score: now, member: thread.id });

  return { ok: true, reply };
}

export async function getReply(id: string): Promise<GuildReply | null> {
  const client = getClient();
  if (!client) return null;
  return parse<GuildReply>(await client.get(`${REPLY_PREFIX}${id}`));
}

/**
 * All replies for a thread, chronological. Deleted replies are kept (as
 * tombstones) so the tree structure and "[removed]" placeholders survive
 * — the page builds the two-tier tree from parentReplyId.
 */
export async function listReplies(threadId: string): Promise<GuildReply[]> {
  const client = getClient();
  if (!client) return [];
  const ids = await client.zrange<string[]>(
    repliesIndexKey(threadId),
    0,
    -1
  );
  if (!ids.length) return [];
  const raw = await client.mget<(string | null)[]>(
    ...ids.map((id) => `${REPLY_PREFIX}${id}`)
  );
  return raw
    .map((r) => parse<GuildReply>(r))
    .filter((r): r is GuildReply => !!r);
}

// --------------------------------------------------------------------
// Edit (author-only, within the window)
// --------------------------------------------------------------------

export type EditResult =
  | { ok: true }
  | {
      ok: false;
      error: "storage_unavailable" | "not_found" | "forbidden" | "window_closed" | "invalid";
    };

function withinEditWindow(createdAt: number): boolean {
  return Date.now() - createdAt <= EDIT_WINDOW_MS;
}

export async function editThread(
  id: string,
  editorEmail: string,
  patch: { title: string; body: string }
): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const thread = await getThread(id);
  if (!thread || thread.deleted) return { ok: false, error: "not_found" };
  if (thread.authorEmail !== normEmail(editorEmail)) {
    return { ok: false, error: "forbidden" };
  }
  if (!withinEditWindow(thread.createdAt)) {
    return { ok: false, error: "window_closed" };
  }
  const title = patch.title.trim().slice(0, MAX_TITLE);
  const body = patch.body.trim().slice(0, MAX_BODY);
  if (!title || !body) return { ok: false, error: "invalid" };
  thread.title = title;
  thread.body = body;
  thread.editedAt = Date.now();
  await client.set(`${THREAD_PREFIX}${id}`, JSON.stringify(thread));
  return { ok: true };
}

export async function editReply(
  id: string,
  editorEmail: string,
  body: string
): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const reply = await getReply(id);
  if (!reply || reply.deleted) return { ok: false, error: "not_found" };
  if (reply.authorEmail !== normEmail(editorEmail)) {
    return { ok: false, error: "forbidden" };
  }
  if (!withinEditWindow(reply.createdAt)) {
    return { ok: false, error: "window_closed" };
  }
  const clean = body.trim().slice(0, MAX_REPLY);
  if (!clean) return { ok: false, error: "invalid" };
  reply.body = clean;
  reply.editedAt = Date.now();
  await client.set(`${REPLY_PREFIX}${id}`, JSON.stringify(reply));
  return { ok: true };
}

// --------------------------------------------------------------------
// Soft delete (author or admin)
// --------------------------------------------------------------------

/**
 * Soft-delete a thread. Kept as a tombstone so its replies and place in
 * the index survive; the page renders "[removed]". Allowed for the
 * author or an admin (Clay presiding).
 */
export async function softDeleteThread(
  id: string,
  actorEmail: string,
  isActorAdmin: boolean
): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const thread = await getThread(id);
  if (!thread) return { ok: false, error: "not_found" };
  if (!isActorAdmin && thread.authorEmail !== normEmail(actorEmail)) {
    return { ok: false, error: "forbidden" };
  }
  thread.deleted = true;
  await client.set(`${THREAD_PREFIX}${id}`, JSON.stringify(thread));
  // Drop from the active index so a removed thread doesn't surface, and
  // clear the pin if this was the pinned thread.
  await client.zrem(THREADS_INDEX, id);
  const pinned = await client.get<string>(PINNED_KEY);
  if (pinned === id) await client.del(PINNED_KEY);
  return { ok: true };
}

export async function softDeleteReply(
  id: string,
  actorEmail: string,
  isActorAdmin: boolean
): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const reply = await getReply(id);
  if (!reply) return { ok: false, error: "not_found" };
  if (!isActorAdmin && reply.authorEmail !== normEmail(actorEmail)) {
    return { ok: false, error: "forbidden" };
  }
  if (!reply.deleted) {
    reply.deleted = true;
    await client.set(`${REPLY_PREFIX}${id}`, JSON.stringify(reply));
    // Decrement the parent thread's visible reply count (floor at 0).
    const thread = await getThread(reply.threadId);
    if (thread && thread.replyCount > 0) {
      thread.replyCount -= 1;
      await client.set(
        `${THREAD_PREFIX}${thread.id}`,
        JSON.stringify(thread)
      );
    }
  }
  return { ok: true };
}

// --------------------------------------------------------------------
// Clay presiding: pin + read-mark (admin only — guarded at the action)
// --------------------------------------------------------------------

export async function pinThread(id: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const thread = await getThread(id);
  if (!thread || thread.deleted) return false;
  // Clear the pinned flag on any previously-pinned thread (one at a time).
  const prevId = await client.get<string>(PINNED_KEY);
  if (prevId && prevId !== id) {
    const prev = await getThread(prevId);
    if (prev) {
      prev.pinned = false;
      await client.set(`${THREAD_PREFIX}${prevId}`, JSON.stringify(prev));
    }
  }
  thread.pinned = true;
  await client.set(`${THREAD_PREFIX}${id}`, JSON.stringify(thread));
  await client.set(PINNED_KEY, id);
  return true;
}

export async function unpinThread(id: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const thread = await getThread(id);
  if (thread) {
    thread.pinned = false;
    await client.set(`${THREAD_PREFIX}${id}`, JSON.stringify(thread));
  }
  const pinned = await client.get<string>(PINNED_KEY);
  if (pinned === id) await client.del(PINNED_KEY);
  return true;
}

/** Mark a thread seen by Clay. His attention is the currency. */
export async function markThreadReadByClay(id: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const thread = await getThread(id);
  if (!thread) return false;
  thread.clayReadAt = Date.now();
  await client.set(`${THREAD_PREFIX}${id}`, JSON.stringify(thread));
  return true;
}

export async function markReplyReadByClay(id: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const reply = await getReply(id);
  if (!reply) return false;
  reply.clayReadAt = Date.now();
  await client.set(`${REPLY_PREFIX}${id}`, JSON.stringify(reply));
  return true;
}
