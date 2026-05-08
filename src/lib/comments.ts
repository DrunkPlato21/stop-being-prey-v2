import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Comments storage. One flat list per piece, no threading. Members get
// one comment per piece. Clay (ADMIN_EMAIL) can post one reply per
// member comment, stored on the comment record itself. Reply edits go
// through delete + re-post.
//
// New comments default to `approved: false` (pre-publish hold). They
// stay invisible to other readers until Clay approves them; the author
// can see their own pending comment with an "awaiting review" hint,
// and Clay can see all pending comments via /comments/admin.
//
// Redis schema:
//   profile:<email>                         JSON { displayName, createdAt }
//   comment:<id>                            JSON CommentRecord
//   comments:<kind>:<slug>                  ZSET, score=createdAt, member=id
//   member-comment:<email>:<kind>:<slug>    string (comment id) — uniqueness lock
//   member-comments:<email>                 SET of comment IDs by author
//   comments:pending                        ZSET of IDs awaiting approval

export type CommentKind = "article" | "note";

export type CommentRecord = {
  id: string;
  kind: CommentKind;
  slug: string;
  email: string;
  displayName: string;
  body: string;
  createdAt: number;
  // Clay's reply lives on the comment record so we don't need a second
  // round-trip to fetch it. Empty when no reply exists.
  replyBody: string | null;
  replyAt: number | null;
  // Pre-publish hold. New comments arrive false; flipped to true via
  // approveComment(). Legacy records without this field are treated as
  // approved (see isApproved()), so existing comments stay visible
  // after the moderation rollout.
  approved?: boolean;
};

/**
 * Treat legacy comments (no `approved` field) as approved so the
 * moderation rollout doesn't retroactively hide existing conversation.
 */
export function isApproved(c: CommentRecord): boolean {
  return c.approved !== false;
}

export type Profile = {
  displayName: string;
  createdAt: number;
  // Whether to email this member when Clay replies to their comment.
  // Optional for back-compat with profiles written before the toggle
  // existed — undefined is treated as opted-in (see notifyOnReply()).
  notifyOnReply?: boolean;
};

/**
 * Whether this profile wants reply notifications. Default-on: legacy
 * profiles (no field) are treated as opted-in so the rollout doesn't
 * silently flip preferences for existing members.
 */
export function notifyOnReply(profile: Profile | null | undefined): boolean {
  if (!profile) return true;
  return profile.notifyOnReply !== false;
}

const PROFILE_PREFIX = "profile:";
const COMMENT_PREFIX = "comment:";
const COMMENTS_INDEX_PREFIX = "comments:";
const MEMBER_LOCK_PREFIX = "member-comment:";
// Set of comment IDs authored by a given email. Lets us rewrite the
// displayName on every past comment when a member edits their profile.
const MEMBER_COMMENTS_PREFIX = "member-comments:";
// Global ZSET of pending (unapproved) comment IDs. Powers the admin
// queue page without needing to walk every per-piece index.
const PENDING_INDEX_KEY = "comments:pending";

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isCommentsConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Whether the given email is Clay (the admin / author). Driven by
 * ADMIN_EMAIL env var so it's swappable without a code change.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) return false;
  return admin.toLowerCase().trim() === email.toLowerCase().trim();
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function indexKey(kind: CommentKind, slug: string): string {
  return `${COMMENTS_INDEX_PREFIX}${kind}:${slug}`;
}

function lockKey(email: string, kind: CommentKind, slug: string): string {
  return `${MEMBER_LOCK_PREFIX}${normEmail(email)}:${kind}:${slug}`;
}

function memberCommentsKey(email: string): string {
  return `${MEMBER_COMMENTS_PREFIX}${normEmail(email)}`;
}

/* === Profiles ============================================== */

export async function getProfile(email: string): Promise<Profile | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${PROFILE_PREFIX}${normEmail(email)}`);
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as Profile)
      : (raw as Profile);
  } catch {
    return null;
  }
}

export async function setProfile(
  email: string,
  displayName: string
): Promise<Profile | null> {
  const client = getClient();
  if (!client) return null;
  const cleaned = sanitizeDisplayName(displayName);
  if (!cleaned) return null;
  // Preserve any existing notification preference so first-comment
  // profile creation doesn't reset a member who pre-emptively opted
  // out before commenting.
  const existing = await getProfile(email);
  const profile: Profile = {
    displayName: cleaned,
    createdAt: existing?.createdAt ?? Date.now(),
    notifyOnReply: existing?.notifyOnReply ?? true,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(email)}`,
    JSON.stringify(profile)
  );
  return profile;
}

/**
 * Update only the reply-notification preference. Creates a minimal
 * profile (empty displayName) if none exists yet — lets a member
 * opt out before posting their first comment. The empty displayName
 * gets filled on first comment, so the placeholder profile is fine.
 */
export async function updateNotifyPreference(
  email: string,
  notifyOnReply: boolean
): Promise<
  | { ok: true; profile: Profile }
  | { ok: false; error: "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const existing = await getProfile(email);
  const profile: Profile = {
    displayName: existing?.displayName ?? "",
    createdAt: existing?.createdAt ?? Date.now(),
    notifyOnReply,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(email)}`,
    JSON.stringify(profile)
  );
  return { ok: true, profile };
}

/**
 * Update the member's display name and rewrite displayName on every
 * past comment they authored. The per-email comment-id set keeps this
 * O(N) over their own comments, not over the whole site.
 */
export async function updateDisplayName(
  email: string,
  displayName: string
): Promise<
  | { ok: true; profile: Profile; updatedComments: number }
  | { ok: false; error: "invalid_display_name" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const cleaned = sanitizeDisplayName(displayName);
  if (!cleaned) return { ok: false, error: "invalid_display_name" };

  // Preserve existing createdAt + notification preference; only the
  // displayName changes here.
  const existing = await getProfile(email);
  const profile: Profile = {
    displayName: cleaned,
    createdAt: existing?.createdAt ?? Date.now(),
    notifyOnReply: existing?.notifyOnReply ?? true,
  };
  await client.set(
    `${PROFILE_PREFIX}${normEmail(email)}`,
    JSON.stringify(profile)
  );

  const ids = ((await client.smembers(memberCommentsKey(email))) ??
    []) as string[];
  let updated = 0;
  for (const id of ids) {
    const current = await getComment(id);
    if (!current) {
      // Drift: comment was deleted but the set entry lingered. Clean up.
      await client.srem(memberCommentsKey(email), id);
      continue;
    }
    if (current.displayName === cleaned) continue;
    const next: CommentRecord = { ...current, displayName: cleaned };
    await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(next));
    updated += 1;
  }

  return { ok: true, profile, updatedComments: updated };
}

/* === Validation ============================================ */

const MAX_BODY = 2000;
const MAX_NAME = 40;

// Match C0 control chars (0x00-0x1F) and DEL (0x7F). Newlines are
// inside the range — we strip them in display-name sanitation, but
// keep them in body sanitation by carving an exception around 0x0A.
const C0_RANGE = " -";
const C0_RANGE_KEEP_LF = " -	-";

export function sanitizeDisplayName(input: string): string {
  // Strip control chars and HTML brackets; collapse whitespace to a
  // single line; forbid URLs so self-promo handles can't sneak in.
  const stripped = input
    .replace(/[<>]/g, "")
    .replace(new RegExp("[" + C0_RANGE + "]", "g"), " ");
  const oneLine = stripped.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  if (/\bhttps?:\/\//i.test(oneLine)) return "";
  return oneLine.slice(0, MAX_NAME);
}

export function sanitizeBody(input: string): string {
  // Preserve newlines (we render them as <br />), strip HTML brackets
  // and other C0 control chars so it's safe to display as text.
  const noControl = input
    .replace(/[<>]/g, "")
    .replace(new RegExp("[" + C0_RANGE_KEEP_LF + "]", "g"), "");
  // Collapse 3+ newlines to 2 so spacing stays readable.
  const collapsed = noControl.replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.slice(0, MAX_BODY);
}

/* === Comments CRUD ========================================= */

export async function listCommentsForSlug(
  kind: CommentKind,
  slug: string
): Promise<CommentRecord[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(indexKey(kind, slug), 0, -1)) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${COMMENT_PREFIX}${id}`);
  const raw = await client.mget<(string | null)[]>(...keys);
  const out: CommentRecord[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as CommentRecord)
          : (value as CommentRecord);
      out.push(parsed);
    } catch {
      // skip malformed
    }
  }
  // Oldest first — feels chronological, matches how the conversation
  // actually unfolded under the piece.
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getComment(id: string): Promise<CommentRecord | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${COMMENT_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as CommentRecord)
      : (raw as CommentRecord);
  } catch {
    return null;
  }
}

export async function getMemberCommentId(
  email: string,
  kind: CommentKind,
  slug: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const value = await client.get<string>(lockKey(email, kind, slug));
  if (!value) return null;
  return typeof value === "string" ? value : String(value);
}

export type CreateCommentInput = {
  email: string;
  displayName: string;
  kind: CommentKind;
  slug: string;
  body: string;
};

export type CreateCommentResult =
  | { ok: true; comment: CommentRecord }
  | {
      ok: false;
      error: "storage_unavailable" | "already_commented" | "empty_body";
    };

export async function createComment(
  input: CreateCommentInput
): Promise<CreateCommentResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const body = sanitizeBody(input.body);
  if (!body) return { ok: false, error: "empty_body" };

  const existing = await getMemberCommentId(input.email, input.kind, input.slug);
  if (existing) return { ok: false, error: "already_commented" };

  const id = randomUUID();
  const now = Date.now();
  const record: CommentRecord = {
    id,
    kind: input.kind,
    slug: input.slug,
    email: normEmail(input.email),
    displayName: input.displayName,
    body,
    createdAt: now,
    replyBody: null,
    replyAt: null,
    approved: false,
  };

  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(record));
  await client.zadd(indexKey(input.kind, input.slug), {
    score: now,
    member: id,
  });
  await client.set(lockKey(input.email, input.kind, input.slug), id);
  await client.sadd(memberCommentsKey(input.email), id);
  await client.zadd(PENDING_INDEX_KEY, { score: now, member: id });

  return { ok: true, comment: record };
}

/**
 * Delete a comment. Authorized for the comment author or the admin.
 * Removes the record, the ZSET entry, and the per-member lock. Clay's
 * reply (if any) dies with it — replies live on the same record.
 */
export async function deleteComment(
  id: string,
  actorEmail: string
): Promise<
  | { ok: true }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const comment = await getComment(id);
  if (!comment) return { ok: false, error: "not_found" };

  const isAuthor = normEmail(actorEmail) === comment.email;
  if (!isAuthor && !isAdmin(actorEmail)) {
    return { ok: false, error: "forbidden" };
  }

  await client.del(`${COMMENT_PREFIX}${id}`);
  await client.zrem(indexKey(comment.kind, comment.slug), id);
  await client.del(lockKey(comment.email, comment.kind, comment.slug));
  await client.srem(memberCommentsKey(comment.email), id);
  await client.zrem(PENDING_INDEX_KEY, id);

  return { ok: true };
}

/**
 * Approve a pending comment. Admin only. Idempotent — approving an
 * already-approved comment is a no-op.
 */
export async function approveComment(
  id: string,
  actorEmail: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(id);
  if (!comment) return { ok: false, error: "not_found" };

  if (isApproved(comment)) {
    // Already approved — make sure it's not still in the pending set
    // (defends against drift from earlier states).
    await client.zrem(PENDING_INDEX_KEY, id);
    return { ok: true, comment };
  }

  const next: CommentRecord = { ...comment, approved: true };
  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(next));
  await client.zrem(PENDING_INDEX_KEY, id);
  return { ok: true, comment: next };
}

/**
 * List all pending comments globally, newest first. Used by the admin
 * queue. Limit is a safety cap.
 */
export async function listPendingComments(
  limit = 100
): Promise<CommentRecord[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(PENDING_INDEX_KEY, 0, limit - 1, {
    rev: true,
  })) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${COMMENT_PREFIX}${id}`);
  const raw = await client.mget<(string | null)[]>(...keys);
  const out: CommentRecord[] = [];
  for (const value of raw) {
    if (!value) continue;
    try {
      const parsed =
        typeof value === "string"
          ? (JSON.parse(value) as CommentRecord)
          : (value as CommentRecord);
      // Guard against stale entries in the pending set.
      if (!isApproved(parsed)) out.push(parsed);
    } catch {
      // skip malformed
    }
  }
  return out;
}

export async function countPendingComments(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  return (await client.zcard(PENDING_INDEX_KEY)) ?? 0;
}

/**
 * Set (or update) Clay's reply on a comment. Admin only. The reply
 * lives on the comment record itself, so writing it is a single set.
 */
export async function setReply(
  commentId: string,
  actorEmail: string,
  body: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | {
      ok: false;
      error: "not_found" | "forbidden" | "empty_body" | "storage_unavailable";
    }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(commentId);
  if (!comment) return { ok: false, error: "not_found" };

  const cleaned = sanitizeBody(body);
  if (!cleaned) return { ok: false, error: "empty_body" };

  const next: CommentRecord = {
    ...comment,
    replyBody: cleaned,
    replyAt: Date.now(),
  };
  await client.set(`${COMMENT_PREFIX}${commentId}`, JSON.stringify(next));
  return { ok: true, comment: next };
}

export async function deleteReply(
  commentId: string,
  actorEmail: string
): Promise<
  | { ok: true; comment: CommentRecord }
  | { ok: false; error: "not_found" | "forbidden" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isAdmin(actorEmail)) return { ok: false, error: "forbidden" };

  const comment = await getComment(commentId);
  if (!comment) return { ok: false, error: "not_found" };

  const next: CommentRecord = { ...comment, replyBody: null, replyAt: null };
  await client.set(`${COMMENT_PREFIX}${commentId}`, JSON.stringify(next));
  return { ok: true, comment: next };
}
