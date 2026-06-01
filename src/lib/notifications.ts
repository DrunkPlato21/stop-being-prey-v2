import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Per-member in-site notifications. Eight trigger types share a
// single record shape so the bell + panel UI doesn't need to
// special-case anything.
//
// Storage:
//   notifications:member:<email>     ZSET, score=createdAt, member=id
//   notifications:unread:<email>     integer counter (cheap badge reads)
//   notification:<id>                JSON Notification record
//
// Retention (opportunistic, runs on every list/count call for the
// requesting member — no separate cron needed at launch volume):
//   - Read notifications older than 14 days are dropped.
//   - Unread notifications older than 60 days are dropped.

const MEMBER_SET_PREFIX = "notifications:member:";
const UNREAD_COUNTER_PREFIX = "notifications:unread:";
const RECORD_PREFIX = "notification:";

const UNREAD_RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const READ_RETENTION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const MAX_TITLE = 80;
const MAX_BODY = 120;

export type NotificationType =
  | "reaction"
  | "reply"
  | "comment_thread_reply"
  | "case_published"
  | "voice_memo"
  | "essay"
  | "wall_opened"
  | "payment_failed"
  | "founder_confirmed"
  | "lounge_reply"
  | "lounge_reaction"
  | "lounge_mention"
  | "coin_received";

export type Notification = {
  id: string;
  memberEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string;
  read: boolean;
  readAt: number | null;
  createdAt: number;
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

export function isNotificationsConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function sanitizeLine(input: string, cap: number): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);
}

function parseRecord(raw: unknown): Notification | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Notification)
        : (raw as Notification);
    if (!parsed || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export type CreateInput = {
  memberEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string;
};

/**
 * Write a notification for one member. Updates the per-member sorted
 * index and the unread counter atomically (best-effort across the
 * three writes — Upstash REST doesn't expose MULTI/EXEC).
 */
export async function createNotification(
  input: CreateInput
): Promise<Notification | null> {
  const client = getClient();
  if (!client) return null;

  const email = normEmail(input.memberEmail);
  if (!email) return null;

  const title = sanitizeLine(input.title, MAX_TITLE);
  const body = sanitizeLine(input.body, MAX_BODY);
  if (!title) return null;

  const id = randomUUID();
  const now = Date.now();
  const notification: Notification = {
    id,
    memberEmail: email,
    type: input.type,
    title,
    body,
    linkUrl: input.linkUrl,
    read: false,
    readAt: null,
    createdAt: now,
  };

  await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(notification));
  await client.zadd(`${MEMBER_SET_PREFIX}${email}`, {
    score: now,
    member: id,
  });
  await client.incr(`${UNREAD_COUNTER_PREFIX}${email}`);

  return notification;
}

/**
 * Fan-out write to many members. Skips the optional `skipEmail`
 * (e.g., don't notify the admin about his own action). Best-effort
 * sequential — at <500 members per fan-out we're fine; past that,
 * batch off the request path.
 */
export async function createForMembers(
  emails: string[],
  input: Omit<CreateInput, "memberEmail">,
  opts?: { skipEmail?: string | null }
): Promise<number> {
  const skip = opts?.skipEmail ? normEmail(opts.skipEmail) : null;
  let written = 0;
  for (const e of emails) {
    const norm = normEmail(e);
    if (!norm || norm === skip) continue;
    const result = await createNotification({
      memberEmail: norm,
      ...input,
    });
    if (result) written += 1;
  }
  return written;
}

/**
 * Drop notifications older than their retention window AND reconcile the
 * unread badge counter to reality. Called from the read paths (list +
 * count) so both run naturally as members visit the site.
 *
 * The unread counter (`notifications:unread:<email>`) is a denormalized
 * cache maintained by separate incr/decr ops, so it can drift ABOVE the
 * true unread count — e.g. an unread record is evicted or orphaned and
 * never gets its decrement, and mark-read can't clear what it can't find.
 * Once that happens nothing pulls the badge back down and it sticks at a
 * phantom number. Since we already load every record here, we recount the
 * genuinely-unread live records and reset the counter to that exact value,
 * so the badge self-heals on the next read. Returns the pruned count and
 * the reconciled unread total.
 */
async function pruneExpired(
  email: string
): Promise<{ pruned: number; unread: number }> {
  const client = getClient();
  if (!client) return { pruned: 0, unread: 0 };
  const now = Date.now();
  const ids = (await client
    .zrange(`${MEMBER_SET_PREFIX}${email}`, 0, -1)
    .catch(() => [] as unknown[])) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    // No live entries means there is nothing unread. Reset so a drifted
    // counter can't keep the badge lit with nothing behind it.
    await client.set(`${UNREAD_COUNTER_PREFIX}${email}`, 0);
    return { pruned: 0, unread: 0 };
  }
  let pruned = 0;
  let unread = 0;
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const raw = await client.get<string>(`${RECORD_PREFIX}${id}`);
    const record = parseRecord(raw);
    if (!record) {
      // Orphaned set entry — drop it. Not counted toward unread (which is
      // precisely the drift that used to strand the counter).
      await client.zrem(`${MEMBER_SET_PREFIX}${email}`, id);
      pruned += 1;
      continue;
    }
    const expired = record.read
      ? record.readAt !== null && now - record.readAt > READ_RETENTION_MS
      : now - record.createdAt > UNREAD_RETENTION_MS;
    if (expired) {
      await client.zrem(`${MEMBER_SET_PREFIX}${email}`, id);
      await client.del(`${RECORD_PREFIX}${id}`);
      pruned += 1;
      continue;
    }
    if (!record.read) unread += 1;
  }
  // Authoritative reconcile: the badge now reflects the records, not the
  // drift-prone running counter.
  await client.set(`${UNREAD_COUNTER_PREFIX}${email}`, unread);
  return { pruned, unread };
}

/**
 * Newest-first list of the member's notifications. Runs the prune
 * pass first so callers see a clean set.
 */
export async function listForMember(
  email: string,
  opts?: { limit?: number; before?: number }
): Promise<Notification[]> {
  const client = getClient();
  if (!client) return [];
  const norm = normEmail(email);
  if (!norm) return [];

  await pruneExpired(norm);

  const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 50);
  // We use zrange by score (when `before` cursor present) or by
  // rank (default newest-first window).
  let ids: string[] = [];
  if (typeof opts?.before === "number" && Number.isFinite(opts.before)) {
    const raw = await client
      .zrange(
        `${MEMBER_SET_PREFIX}${norm}`,
        opts.before - 1,
        0,
        { byScore: true, rev: true, offset: 0, count: limit }
      )
      .catch(() => [] as unknown[]);
    ids = Array.isArray(raw) ? (raw as string[]) : [];
  } else {
    const raw = await client
      .zrange(`${MEMBER_SET_PREFIX}${norm}`, 0, limit - 1, { rev: true })
      .catch(() => [] as unknown[]);
    ids = Array.isArray(raw) ? (raw as string[]) : [];
  }
  if (ids.length === 0) return [];

  const keys = ids.map((id) => `${RECORD_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: Notification[] = [];
  for (const value of raw) {
    const parsed = parseRecord(value);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

/**
 * Cheap unread count for the bell badge. Prunes first so stale
 * counters self-heal.
 */
export async function unreadCount(email: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const norm = normEmail(email);
  if (!norm) return 0;
  // Cheap single read — this runs on the bell's 30s poll, so it must NOT
  // scan every record (a member with hundreds of notifications would cost
  // hundreds of Redis commands per poll). The counter is reconciled to
  // truth on panel open (listForMember -> pruneExpired) and forced to 0
  // by markAllRead, so the cheap read stays honest.
  const raw = await client.get<number | string>(
    `${UNREAD_COUNTER_PREFIX}${norm}`
  );
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

/**
 * Flip an explicit set of notification IDs to read. Only decrements
 * the counter for entries that were genuinely unread (idempotent on
 * re-call). Returns the number of records actually flipped.
 */
export async function markRead(
  email: string,
  ids: string[]
): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const norm = normEmail(email);
  if (!norm || ids.length === 0) return 0;
  const now = Date.now();
  let flipped = 0;
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) continue;
    const raw = await client.get<string>(`${RECORD_PREFIX}${id}`);
    const record = parseRecord(raw);
    if (!record) continue;
    if (record.memberEmail !== norm) continue; // ownership gate
    if (record.read) continue;
    const next: Notification = { ...record, read: true, readAt: now };
    await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(next));
    await client.decr(`${UNREAD_COUNTER_PREFIX}${norm}`);
    flipped += 1;
  }
  return flipped;
}

/**
 * Mark every unread notification on this member as read. Used by
 * the panel's "mark all" affordance + on /notifications page view.
 */
export async function markAllRead(email: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const norm = normEmail(email);
  if (!norm) return 0;
  const ids = (await client
    .zrange(`${MEMBER_SET_PREFIX}${norm}`, 0, -1)
    .catch(() => [] as unknown[])) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    await client.set(`${UNREAD_COUNTER_PREFIX}${norm}`, 0);
    return 0;
  }
  const flipped = await markRead(norm, ids);
  // Force the badge to zero. markRead only decrements for records it can
  // find and that were unread, so orphans/drift could otherwise strand
  // the counter above 0. "Mark all read" means unread is definitively 0.
  await client.set(`${UNREAD_COUNTER_PREFIX}${norm}`, 0);
  return flipped;
}
