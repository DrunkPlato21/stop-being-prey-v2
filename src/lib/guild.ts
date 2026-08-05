import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import {
  DEFAULT_GUILD_CATEGORY,
  EDIT_WINDOW_MS,
  isGuildCategory,
  MAX_BODY,
  MAX_IMAGES,
  MAX_REPLY,
  MAX_TITLE,
  postImages,
  type GuildCategory,
  type GuildImageMedia,
} from "./guild-constants";
// Reactions reuse the Lounge's exact set, emoji, and labels so the two
// rooms are identical.
import { isReactionKey, type ReactionKey } from "./lounge";

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
// Per-thread HASH of member email -> last time they opened this thread.
// Deliberately NOT the Guild-wide nav stamp used by the index's NEW tags:
// that one is reset by a visit to the index, which would tell a member
// they'd read threads they never opened. One hash per thread keeps the
// key count flat and lets a single HGET answer "what have I not seen".
const threadReadKey = (threadId: string) =>
  `${THREAD_PREFIX}${threadId}:read`;
// Per-thread HASH of member email -> "1" watching, "0" muted. Absent means
// never involved. Joined automatically by starting or answering a thread,
// because asking a member to opt in to hearing back from a conversation
// they're already in is a manual step that mostly gets skipped.
const threadWatchKey = (threadId: string) =>
  `${THREAD_PREFIX}${threadId}:watch`;
// Per-thread HASH of member email -> when they were last told about a new
// reply. Compared against their read stamp so a thread can only hold one
// unread ping at a time. See notifyThreadWatchers.
const threadNotifiedKey = (threadId: string) =>
  `${THREAD_PREFIX}${threadId}:notified`;

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

// The image shape + the multi-image read helper live in guild-constants
// (no server deps) so client composers/renderers share them. Re-exported
// here for the many server-side consumers that import from this module.
export { postImages, type GuildImageMedia };

export type GuildThread = {
  id: string;
  authorEmail: string;
  title: string;
  body: string;
  // The kind of post, chosen at creation. Required going forward; legacy
  // threads written before categories existed are defaulted on read.
  category: GuildCategory;
  createdAt: number;
  editedAt: number | null;
  // Bumped to the newest reply's createdAt so the active index surfaces
  // threads with live conversation. Equals createdAt for a fresh thread.
  lastActivityAt: number;
  // The newest live reply's id and author, denormalized on every reply
  // (and recomputed on delete/restore) so the index can attribute "last
  // reply from <name>" and deep-link to it without fetching the reply set.
  // Both absent on a thread with no replies and on legacy threads written
  // before this was tracked — the index falls back to the plain byline.
  lastReplyId?: string | null;
  lastReplyAuthorEmail?: string | null;
  // Count of non-deleted replies. Maintained on create/delete so the
  // index can show "N replies" without fetching every reply.
  replyCount: number;
  pinned: boolean;
  // The one reply Clay has pinned to the top of this thread, if any.
  // null/absent = nothing pinned. One per thread — pinning replaces.
  // Cleared automatically if the pinned reply is deleted.
  pinnedReplyId?: string | null;
  // When Clay marked this thread read. null = unseen by the king.
  clayReadAt: number | null;
  deleted: boolean;
  // Attached images (up to MAX_IMAGES). New posts write this array. Read
  // via postImages(), never these fields directly.
  mediaList?: GuildImageMedia[] | null;
  // Legacy single image, written before multi-image. Kept for read-through
  // (postImages lifts it into an array); never written going forward.
  media?: GuildImageMedia | null;
};

export type GuildReply = {
  id: string;
  threadId: string;
  // null = a top-level reply to the thread. Otherwise the reply this is
  // nested under. The page caps visual depth at two levels.
  parentReplyId: string | null;
  // The comment whose Reply button was actually clicked — the TRUE target.
  // Unlike parentReplyId (which we flatten to two visual tiers, so a
  // grandchild's parent becomes its top-level ancestor), this survives the
  // flatten, so the UI can always label "Replying to <the real person>".
  // null on a top-level reply; absent on replies written before this field.
  replyToId?: string | null;
  authorEmail: string;
  body: string;
  createdAt: number;
  editedAt: number | null;
  clayReadAt: number | null;
  deleted: boolean;
  // Attached images (up to MAX_IMAGES), same as a thread. Read via
  // postImages(); mediaList is the new array, media the legacy single.
  mediaList?: GuildImageMedia[] | null;
  media?: GuildImageMedia | null;
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

// Ensure a thread read from storage carries a valid category. Threads
// written before categories existed have none; default them so callers
// and the UI never see an undefined category.
function withCategory(thread: GuildThread | null): GuildThread | null {
  if (thread && !isGuildCategory(thread.category)) {
    thread.category = DEFAULT_GUILD_CATEGORY;
  }
  return thread;
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

/**
 * Batch guard for reply EMAILS: at most one per (recipient, thread) per
 * window. The bell fires on every reply, but a hot thread should send a
 * single "come look" email, not one per reply. Fails CLOSED (returns
 * false, no email) when the store is unavailable — a missed email beats
 * a burst of them.
 */
export async function claimReplyEmailCooldown(
  recipientEmail: string,
  threadId: string,
  seconds = 2 * 60 * 60
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const key = `${KEY_PREFIX}guild:emailcooldown:${normEmail(recipientEmail)}:${threadId}`;
  const ok = await client.set(key, "1", { nx: true, ex: seconds });
  return ok === "OK";
}

// --------------------------------------------------------------------
// Threads
// --------------------------------------------------------------------

export type CreateThreadResult =
  | { ok: true; thread: GuildThread }
  | { ok: false; error: "storage_unavailable" | "rate_limited" | "invalid" };

// An attached image must point at our own Blob store and have sane
// dimensions. Anything else is dropped to null (the thread just posts
// without an image) rather than rejected. Mirrors the Lounge's check.
const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i;
const MAX_MEDIA_DIM = 5000;

function validateThreadImage(raw: unknown): GuildImageMedia | null {
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

// Validate a whole attachment list: each item runs the single-image check,
// invalid ones are dropped (never rejects the post), and the list is capped
// at MAX_IMAGES. Tolerates a bare object (a legacy/direct single-image POST)
// by treating it as a one-element list. Returns [] when there's nothing valid.
function validateImages(raw: unknown): GuildImageMedia[] {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: GuildImageMedia[] = [];
  for (const item of items) {
    const v = validateThreadImage(item);
    if (v) out.push(v);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

export async function createThread(args: {
  authorEmail: string;
  title: string;
  body: string;
  category: string;
  media?: unknown;
}): Promise<CreateThreadResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const title = args.title.trim().slice(0, MAX_TITLE);
  const body = args.body.trim().slice(0, MAX_BODY);
  if (!title || !body) return { ok: false, error: "invalid" };
  const images = validateImages(args.media);
  // The composer forces a valid pick; a direct POST might not. Coerce
  // anything unrecognized to the default rather than reject.
  const category: GuildCategory = isGuildCategory(args.category)
    ? args.category
    : DEFAULT_GUILD_CATEGORY;

  if (!(await claimCooldown(args.authorEmail, "thread", THREAD_COOLDOWN_SECONDS))) {
    return { ok: false, error: "rate_limited" };
  }

  const now = Date.now();
  const thread: GuildThread = {
    id: randomUUID(),
    authorEmail: normEmail(args.authorEmail),
    title,
    body,
    category,
    createdAt: now,
    editedAt: null,
    lastActivityAt: now,
    replyCount: 0,
    pinned: false,
    clayReadAt: null,
    deleted: false,
    mediaList: images.length ? images : null,
  };
  await client.set(`${THREAD_PREFIX}${thread.id}`, JSON.stringify(thread));
  await client.zadd(THREADS_INDEX, { score: now, member: thread.id });
  return { ok: true, thread };
}

export async function getThread(id: string): Promise<GuildThread | null> {
  const client = getClient();
  if (!client) return null;
  return withCategory(parse<GuildThread>(await client.get(`${THREAD_PREFIX}${id}`)));
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
  /** Show only this kind of thread. Omit for the whole library. */
  category?: GuildCategory;
}): Promise<ThreadPage> {
  const client = getClient();
  if (!client) return { threads: [], hasMore: false };
  const limit = args?.limit ?? 25;

  // Filtering can't page through the index a slice at a time: a category
  // may have nothing in the first 25 ids and plenty below them. At this
  // room's size (tens of threads) the honest answer is to read the index
  // and filter it, which is one zrange and one mget. If the library ever
  // outgrows the cap, that's the point to add a per-category index rather
  // than quietly return a short list.
  if (args?.category) {
    return listByCategory(client, args.category, limit, args.before);
  }

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
    .map((r) => withCategory(parse<GuildThread>(r)))
    .filter((t): t is GuildThread => !!t && !t.deleted && !t.pinned);
  return { threads, hasMore };
}

// How far down the (activity-ordered) index a category filter will look.
// Well past the current library; see the note in listActiveThreads.
const CATEGORY_SCAN_CAP = 500;

async function listByCategory(
  client: Redis,
  category: GuildCategory,
  limit: number,
  before?: number
): Promise<ThreadPage> {
  const ids = (await client
    .zrange(THREADS_INDEX, 0, CATEGORY_SCAN_CAP, { rev: true })
    .catch(() => [] as unknown[])) as string[];
  if (!ids.length) return { threads: [], hasMore: false };
  const raw = await client.mget<(string | null)[]>(
    ...ids.map((id) => `${THREAD_PREFIX}${id}`)
  );
  let matching = raw
    .map((r) => withCategory(parse<GuildThread>(r)))
    .filter(
      (t): t is GuildThread =>
        !!t && !t.deleted && !t.pinned && t.category === category
    );
  // Same cursor contract as the unfiltered read: everything strictly older
  // than the last row the member has already been shown.
  if (typeof before === "number" && Number.isFinite(before)) {
    matching = matching.filter((t) => t.lastActivityAt < before);
  }
  return {
    threads: matching.slice(0, limit),
    hasMore: matching.length > limit,
  };
}

// --------------------------------------------------------------------
// Search
// --------------------------------------------------------------------

// A library nobody can search stops compounding: the thread from six weeks
// ago can't be found, so it's never cited, so it's dead weight. This is a
// scan, not an index — honest at this room's size, and the caps below say
// out loud where it stops rather than quietly returning less.
const SEARCH_THREAD_CAP = 200;
// Reading replies costs a zrange + an mget per thread, so full-text search
// covers the most recently active threads. Older ones still match on their
// title and opening post. Callers get told which case they're in.
export const SEARCH_REPLY_CAP = 50;

export type GuildSearchHit = {
  thread: GuildThread;
  /** Text around the first match, for the result row. */
  snippet: string;
  /** Set when the match was found in a reply, for the deep link. */
  replyId: string | null;
  replyAuthorEmail: string | null;
  /** How many replies in this thread matched. */
  matchingReplies: number;
};

export type GuildSearchResult = {
  hits: GuildSearchHit[];
  /** False when a cap kept some threads from being searched in full. */
  fullyScanned: boolean;
  /** How many threads were looked at. */
  scanned: number;
};

/** Split a query into the words every hit has to contain. */
function searchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function hasAllTokens(haystack: string, tokens: string[]): boolean {
  const lower = haystack.toLowerCase();
  return tokens.every((t) => lower.includes(t));
}

/**
 * Text around the first token, trimmed to word boundaries. The composer's
 * markers (**bold**, *italic*, "> ") are stripped: a result row is a
 * preview of what was said, not a preview of how it was typed.
 */
function makeSnippet(text: string, tokens: string[], span = 90): string {
  const clean = text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const lower = clean.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return clean.slice(0, span * 2).trim();
  let start = Math.max(0, at - span);
  let end = Math.min(clean.length, at + span);
  if (start > 0) {
    const sp = clean.indexOf(" ", start);
    if (sp !== -1 && sp < at) start = sp + 1;
  }
  if (end < clean.length) {
    const sp = clean.lastIndexOf(" ", end);
    if (sp !== -1 && sp > at) end = sp;
  }
  return `${start > 0 ? "… " : ""}${clean.slice(start, end).trim()}${
    end < clean.length ? " …" : ""
  }`;
}

/**
 * Find threads whose title, opening post, or replies contain every word in
 * the query. Ordered by the index's own activity order, so the freshest
 * conversation on a topic comes first.
 */
export async function searchThreads(
  query: string,
  opts?: { limit?: number }
): Promise<GuildSearchResult> {
  const client = getClient();
  const tokens = searchTokens(query);
  if (!client || !tokens.length) {
    return { hits: [], fullyScanned: true, scanned: 0 };
  }
  const limit = opts?.limit ?? 40;

  const ids = (await client
    .zrange(THREADS_INDEX, 0, SEARCH_THREAD_CAP, { rev: true })
    .catch(() => [] as unknown[])) as string[];
  if (!ids.length) return { hits: [], fullyScanned: true, scanned: 0 };
  const raw = await client.mget<(string | null)[]>(
    ...ids.map((id) => `${THREAD_PREFIX}${id}`)
  );
  const threads = raw
    .map((r) => withCategory(parse<GuildThread>(r)))
    .filter((t): t is GuildThread => !!t && !t.deleted);

  // Replies are fetched only for the freshest slice; everything else is
  // matched on its title and opening post.
  const deep = threads.slice(0, SEARCH_REPLY_CAP);
  const replyLists = await Promise.all(
    deep.map((t) => listReplies(t.id).catch(() => [] as GuildReply[]))
  );
  const repliesByThread = new Map<string, GuildReply[]>();
  deep.forEach((t, i) => repliesByThread.set(t.id, replyLists[i]));

  const hits: GuildSearchHit[] = [];
  for (const thread of threads) {
    const inTitle = hasAllTokens(thread.title, tokens);
    const inBody = hasAllTokens(thread.body, tokens);
    const replies = (repliesByThread.get(thread.id) ?? []).filter(
      (r) => !r.deleted && hasAllTokens(r.body, tokens)
    );
    if (!inTitle && !inBody && !replies.length) continue;
    // Prefer showing the opening post; a match only in the replies points
    // straight at the reply that carries it.
    const fromReply = !inTitle && !inBody && replies.length > 0;
    const source = fromReply ? replies[0].body : inBody ? thread.body : thread.title;
    hits.push({
      thread,
      snippet: makeSnippet(source, tokens),
      replyId: fromReply ? replies[0].id : null,
      replyAuthorEmail: fromReply ? replies[0].authorEmail : null,
      matchingReplies: replies.length,
    });
    if (hits.length >= limit) break;
  }

  return {
    hits,
    fullyScanned: threads.length <= SEARCH_REPLY_CAP && ids.length <= SEARCH_THREAD_CAP,
    scanned: threads.length,
  };
}

/**
 * Wall-clock time (epoch ms) of the most recent thread-or-reply activity
 * anywhere in the Guild, or 0 when empty. The threads index is re-scored to
 * `now` on every new thread and every reply, so the top score is the
 * freshest activity across the room — one zrange does it. Powers the nav
 * "new activity" dot. Mirrors the Lounge's getLoungeLatestActivityAt.
 */
export async function getGuildLatestActivityAt(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const result = await client
    .zrange(THREADS_INDEX, 0, 0, { rev: true, withScores: true })
    .catch(() => null);
  // Upstash returns [member, score] with withScores; we asked for one.
  if (!Array.isArray(result) || result.length < 2) return 0;
  const score = Number(result[1]);
  return Number.isFinite(score) ? score : 0;
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
  media?: unknown;
}): Promise<CreateReplyResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const body = args.body.trim().slice(0, MAX_REPLY);
  // A reply may be text, image(s), or both — but not empty. Same Blob-host
  // re-validation the thread composer uses, per image.
  const images = validateImages(args.media);
  if (!body && images.length === 0) return { ok: false, error: "invalid" };

  const thread = await getThread(args.threadId);
  if (!thread || thread.deleted) return { ok: false, error: "thread_missing" };

  // If replying under another reply, flatten beyond two visual levels:
  // a reply to a depth-1 reply re-parents to that reply (depth stays 1),
  // which the page renders as a single nested tier. We only need to
  // guarantee the parent exists and belongs to this thread.
  let parentReplyId = args.parentReplyId;
  let replyToId: string | null = null;
  if (parentReplyId) {
    const parent = await getReply(parentReplyId);
    if (!parent || parent.threadId !== args.threadId || parent.deleted) {
      parentReplyId = null;
    } else {
      // The comment they actually answered — kept verbatim for the
      // "Replying to <name>" label, before any flattening below.
      replyToId = parent.id;
      if (parent.parentReplyId) {
        // Grandchild — re-parent up one so nesting never exceeds two tiers.
        parentReplyId = parent.parentReplyId;
      }
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
    replyToId,
    authorEmail: normEmail(args.authorEmail),
    body,
    createdAt: now,
    editedAt: null,
    clayReadAt: null,
    deleted: false,
    mediaList: images.length ? images : null,
  };
  await client.set(`${REPLY_PREFIX}${reply.id}`, JSON.stringify(reply));
  await client.zadd(repliesIndexKey(args.threadId), {
    score: now,
    member: reply.id,
  });

  // Bump the thread's activity + reply count and re-score the index so
  // the thread floats to the top of the active list. Denormalize the new
  // reply as the thread's "last reply" so the index can attribute it.
  thread.replyCount += 1;
  thread.lastActivityAt = now;
  thread.lastReplyId = reply.id;
  thread.lastReplyAuthorEmail = reply.authorEmail;
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
// Per-thread read stamps
// --------------------------------------------------------------------

/**
 * When this member last opened this thread (epoch ms), or 0 if never.
 * Read BEFORE marking the visit, or every thread reports itself fully
 * read the instant it's opened.
 */
export async function getThreadLastRead(
  threadId: string,
  email: string
): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  try {
    const at = await client.hget<number | string>(
      threadReadKey(threadId),
      normEmail(email)
    );
    const n = typeof at === "string" ? Number(at) : at;
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  } catch {
    // A missing stamp reads as "never", which shows no markers at all.
    // Failing quiet is right: a broken read must not fake unread replies.
    return 0;
  }
}

/** Record that this member has now seen the thread up to `at`. */
export async function markThreadRead(
  threadId: string,
  email: string,
  at: number = Date.now()
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.hset(threadReadKey(threadId), { [normEmail(email)]: at });
  } catch {
    // Never let a bookkeeping write break opening a thread.
  }
}

// --------------------------------------------------------------------
// Watching a thread
// --------------------------------------------------------------------

/** Is this member watching, muted, or not involved? */
export async function getWatchState(
  threadId: string,
  email: string
): Promise<"watching" | "muted" | "none"> {
  const client = getClient();
  if (!client) return "none";
  try {
    const v = await client.hget<string | number>(
      threadWatchKey(threadId),
      normEmail(email)
    );
    if (v === null || v === undefined) return "none";
    return String(v) === "1" ? "watching" : "muted";
  } catch {
    return "none";
  }
}

/** Explicitly start or stop watching. */
export async function setWatchState(
  threadId: string,
  email: string,
  watching: boolean
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.hset(threadWatchKey(threadId), {
      [normEmail(email)]: watching ? "1" : "0",
    });
  } catch {}
}

/**
 * Join a member to a thread because they took part in it. Never overrides
 * an existing value: a member who deliberately muted a thread and then
 * answered one person in it has not asked to hear everything again.
 */
export async function autoWatchThread(
  threadId: string,
  email: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.hsetnx(threadWatchKey(threadId), normEmail(email), "1");
  } catch {}
}

/** Everyone currently watching this thread. */
export async function listWatchers(threadId: string): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const all = await client.hgetall<Record<string, string | number>>(
      threadWatchKey(threadId)
    );
    if (!all) return [];
    return Object.entries(all)
      .filter(([, v]) => String(v) === "1")
      .map(([email]) => email);
  } catch {
    return [];
  }
}

/**
 * Which watchers should be told about a new reply.
 *
 * A watcher who already has an unread ping for this thread is skipped:
 * they were notified, they haven't been back since, and a second bell for
 * the same unread conversation is noise. Once they open the thread (which
 * writes a read stamp newer than the notice) the next reply rings again.
 * That bounds a hot thread to one notification per member per visit
 * instead of one per reply, which is what makes watching survivable.
 *
 * Returns the recipients and stamps them as notified in one go.
 */
export async function claimWatcherNotifications(
  threadId: string,
  candidates: string[],
  now: number = Date.now()
): Promise<string[]> {
  const client = getClient();
  if (!client || !candidates.length) return [];
  try {
    const [reads, notices] = await Promise.all([
      client.hgetall<Record<string, string | number>>(threadReadKey(threadId)),
      client.hgetall<Record<string, string | number>>(
        threadNotifiedKey(threadId)
      ),
    ]);
    const num = (v: unknown) => {
      const n = typeof v === "string" ? Number(v) : (v as number);
      return typeof n === "number" && Number.isFinite(n) ? n : 0;
    };
    const due = candidates.filter((email) => {
      const lastRead = num(reads?.[email]);
      const lastNotified = num(notices?.[email]);
      // Nothing pending only when they've been back since the last notice.
      return lastNotified <= lastRead;
    });
    if (!due.length) return [];
    await client.hset(
      threadNotifiedKey(threadId),
      Object.fromEntries(due.map((e) => [e, now]))
    );
    return due;
  } catch {
    // Fail closed: a missed bell beats a burst of them.
    return [];
  }
}

/**
 * The newest non-deleted reply in a thread, or null if there are none.
 * Reads only a short tail of the (createdAt-scored) index so a just-
 * deleted newest reply falls through to the next live one without
 * pulling the whole reply set — this is called on the frequently-polled
 * Desk peek, so it stays cheap on Redis.
 */
export async function getLatestReply(
  threadId: string
): Promise<GuildReply | null> {
  const client = getClient();
  if (!client) return null;
  // Negative indices = the highest-scored (newest) members, ascending.
  const ids = await client.zrange<string[]>(repliesIndexKey(threadId), -6, -1);
  if (!ids.length) return null;
  // Walk newest-first; return the first one that isn't a tombstone.
  for (let i = ids.length - 1; i >= 0; i--) {
    const reply = await getReply(ids[i]);
    if (reply && !reply.deleted) return reply;
  }
  return null;
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
  // An image-only reply may keep an empty body; a text reply may not go blank.
  if (!clean && postImages(reply).length === 0) return { ok: false, error: "invalid" };
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
    // Decrement the parent thread's visible reply count (floor at 0) and
    // clear the pin if this was the pinned reply — a tombstone must never
    // sit at the top of the thread.
    const thread = await getThread(reply.threadId);
    if (thread) {
      if (thread.replyCount > 0) thread.replyCount -= 1;
      if (thread.pinnedReplyId === id) thread.pinnedReplyId = null;
      // If we just removed the thread's newest reply, roll the denormalized
      // "last reply" (and the activity time + index score) back to the next
      // live reply, so the index never attributes a tombstone or shows a
      // time that no longer has a post behind it. reply.deleted is already
      // persisted above, so getLatestReply skips it.
      if (thread.lastReplyId === id) {
        const latest = await getLatestReply(thread.id);
        thread.lastReplyId = latest ? latest.id : null;
        thread.lastReplyAuthorEmail = latest ? latest.authorEmail : null;
        thread.lastActivityAt = latest ? latest.createdAt : thread.createdAt;
        await client.zadd(THREADS_INDEX, {
          score: thread.lastActivityAt,
          member: thread.id,
        });
      }
      await client.set(
        `${THREAD_PREFIX}${thread.id}`,
        JSON.stringify(thread)
      );
    }
  }
  return { ok: true };
}

// --------------------------------------------------------------------
// Restore (admin only — undo a soft delete)
// --------------------------------------------------------------------

// Soft deletes are tombstones, not erasures, so a restore is just
// flipping the flag back and undoing the index/count bookkeeping the
// delete did. Admin-guarded at the action layer.

export async function restoreThread(id: string): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const thread = await getThread(id);
  if (!thread) return { ok: false, error: "not_found" };
  if (thread.deleted) {
    thread.deleted = false;
    await client.set(`${THREAD_PREFIX}${id}`, JSON.stringify(thread));
    // softDeleteThread dropped it from the active index; put it back at
    // its last-activity score so it sorts where it belongs.
    await client.zadd(THREADS_INDEX, {
      score: thread.lastActivityAt,
      member: id,
    });
  }
  return { ok: true };
}

export async function restoreReply(id: string): Promise<EditResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const reply = await getReply(id);
  if (!reply) return { ok: false, error: "not_found" };
  if (reply.deleted) {
    reply.deleted = false;
    await client.set(`${REPLY_PREFIX}${id}`, JSON.stringify(reply));
    // Add the visible reply back to its thread's count (delete decremented).
    const thread = await getThread(reply.threadId);
    if (thread) {
      thread.replyCount += 1;
      // The restored reply may once again be the newest live one — recompute
      // the denormalized "last reply", activity time, and index score from
      // the current live tail so the index reflects it. reply.deleted is
      // already cleared above, so getLatestReply now considers it.
      const latest = await getLatestReply(thread.id);
      if (latest) {
        thread.lastReplyId = latest.id;
        thread.lastReplyAuthorEmail = latest.authorEmail;
        thread.lastActivityAt = latest.createdAt;
        await client.zadd(THREADS_INDEX, {
          score: thread.lastActivityAt,
          member: thread.id,
        });
      }
      await client.set(`${THREAD_PREFIX}${thread.id}`, JSON.stringify(thread));
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

// Pin one reply to the top of its thread. Clay's editorial lever: usually
// his own answer, but any member reply he wants to crown. One pin per
// thread — pinning replaces whatever was pinned before. Guarded admin-only
// at the action layer. The reply must be a live, top-level reply of this
// thread (nested replies don't carry their context to the top).
export async function pinReply(
  threadId: string,
  replyId: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const [thread, reply] = await Promise.all([
    getThread(threadId),
    getReply(replyId),
  ]);
  if (!thread || thread.deleted) return false;
  if (
    !reply ||
    reply.threadId !== threadId ||
    reply.deleted ||
    reply.parentReplyId !== null
  ) {
    return false;
  }
  thread.pinnedReplyId = replyId;
  await client.set(`${THREAD_PREFIX}${threadId}`, JSON.stringify(thread));
  return true;
}

export async function unpinReply(threadId: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const thread = await getThread(threadId);
  if (!thread) return false;
  thread.pinnedReplyId = null;
  await client.set(`${THREAD_PREFIX}${threadId}`, JSON.stringify(thread));
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

// --------------------------------------------------------------------
// Reactions (threads + replies share one keyspace, keyed by target id)
// --------------------------------------------------------------------

// One HASH per target: field = member email, value = reaction key. One
// reaction per member per target. Counts are derived on read.
const REACTIONS_PREFIX = `${KEY_PREFIX}guild:reactions:`;

export type ReactionSummary = {
  counts: Partial<Record<ReactionKey, number>>;
  total: number;
  /** The viewer's own reaction, if any. */
  myReaction: ReactionKey | null;
};

const EMPTY_SUMMARY: ReactionSummary = {
  counts: {},
  total: 0,
  myReaction: null,
};

function summarize(
  hash: Record<string, string> | null | undefined,
  viewerEmail: string | null
): ReactionSummary {
  const counts: Partial<Record<ReactionKey, number>> = {};
  let total = 0;
  let myReaction: ReactionKey | null = null;
  const viewer = viewerEmail ? normEmail(viewerEmail) : null;
  if (hash) {
    for (const [email, reaction] of Object.entries(hash)) {
      if (!isReactionKey(reaction)) continue;
      counts[reaction] = (counts[reaction] ?? 0) + 1;
      total += 1;
      if (viewer && email.toLowerCase() === viewer) myReaction = reaction;
    }
  }
  return { counts, total, myReaction };
}

/** Reaction summaries for a batch of target ids (a thread + its replies). */
export async function getGuildReactions(
  targetIds: string[],
  viewerEmail: string | null
): Promise<Record<string, ReactionSummary>> {
  const out: Record<string, ReactionSummary> = {};
  const client = getClient();
  if (!client || targetIds.length === 0) {
    for (const id of targetIds) out[id] = EMPTY_SUMMARY;
    return out;
  }
  const hashes = await Promise.all(
    targetIds.map((id) =>
      client
        .hgetall<Record<string, string>>(`${REACTIONS_PREFIX}${id}`)
        .catch(() => null)
    )
  );
  targetIds.forEach((id, i) => {
    out[id] = summarize(hashes[i], viewerEmail);
  });
  return out;
}

/** Who reacted to one target, and with what. Emails only; the caller
    resolves display names. Used by the "see who reacted" popover. */
export async function getGuildReactors(
  targetId: string
): Promise<Array<{ email: string; reaction: ReactionKey }>> {
  const client = getClient();
  if (!client) return [];
  const hash = await client
    .hgetall<Record<string, string>>(`${REACTIONS_PREFIX}${targetId}`)
    .catch(() => null);
  if (!hash) return [];
  const out: Array<{ email: string; reaction: ReactionKey }> = [];
  for (const [email, reaction] of Object.entries(hash)) {
    if (isReactionKey(reaction)) out.push({ email, reaction });
  }
  return out;
}

/**
 * Set, switch, or clear the caller's reaction on a target. Passing the
 * reaction you already have (or null) removes it. `added` is true only
 * when this is a brand-new reaction (was none before) — the signal the
 * caller uses to decide whether to notify the target's owner.
 */
export async function setGuildReaction(
  targetId: string,
  email: string,
  choice: ReactionKey | null
): Promise<{ ok: boolean; added: boolean; summary: ReactionSummary }> {
  const client = getClient();
  if (!client) return { ok: false, added: false, summary: EMPTY_SUMMARY };
  const key = `${REACTIONS_PREFIX}${targetId}`;
  const field = normEmail(email);
  const currentRaw = await client.hget<string>(key, field).catch(() => null);
  const current = isReactionKey(currentRaw) ? currentRaw : null;

  let added = false;
  if (choice === null || choice === current) {
    if (current !== null) await client.hdel(key, field);
  } else {
    await client.hset(key, { [field]: choice });
    added = current === null;
  }

  const hash = await client
    .hgetall<Record<string, string>>(key)
    .catch(() => null);
  return { ok: true, added, summary: summarize(hash, email) };
}
