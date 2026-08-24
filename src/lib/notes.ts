import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { isAdmin } from "./comments";

// Member-to-Clay notes. Asynchronous, no chat, no threading. Members
// leave a note on the desk; Clay reads + replies (or archives) from
// /admin/notes when he's at the desk.
//
// Redis schema:
//   notes:all                    ZSET, score=createdAt, member=id
//   note:<id>                    JSON Note
//   notes:by-member:<email>      ZSET of note ids authored by that email

const NOTES_INDEX = "notes:all";
const NOTE_PREFIX = "note:";
const MEMBER_NOTES_PREFIX = "notes:by-member:";

export type NoteVisibility = "private" | "public";
export type NoteStatus = "new" | "read" | "replied" | "archived";

/**
 * Clay-only reaction set. Four colorful glyphs, no member-to-member
 * reactions. Set independently of `clayReply` — Clay can react,
 * reply, both, or neither.
 */
export type ClayReaction =
  | "heart"
  | "thumb"
  | "laugh"
  | "fire"
  | "shock";

export type Note = {
  id: string;
  fromEmail: string;
  /** Display name at the moment of submission. Snapshotted so a
      later display-name edit doesn't rewrite history on Clay's queue. */
  fromName: string;
  body: string;
  visibility: NoteVisibility;
  createdAt: number;
  clayReply: string | null;
  clayRepliedAt: number | null;
  /** When the reply email actually reached Resend. Null until a send
      succeeds, so a failed send stays retryable: resubmitting the same
      text sends again instead of being skipped as "unchanged". */
  replyEmailedAt: number | null;
  clayReaction: ClayReaction | null;
  clayReactedAt: number | null;
  status: NoteStatus;
};

// Note + reply caps now live in notes-constants.ts so the client
// components share one source of truth with this module. The admin
// reply box used to carry its own hardcoded copy, which is exactly how
// a client and server cap drift apart without anyone noticing.
import { MAX_BODY, MAX_REPLY } from "./notes-constants";

const MAX_NAME = 60;

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isNotesConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function sanitizeBody(input: string, max: number): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function sanitizeName(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

const VALID_REACTIONS: ClayReaction[] = [
  "heart",
  "thumb",
  "laugh",
  "fire",
  "shock",
];

function parseNote(raw: unknown): Note | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<Note>)
        : (raw as Partial<Note>);
    if (!parsed || typeof parsed !== "object") return null;
    // Normalize fields on legacy records — coerces unknown legacy
    // reaction values (e.g. "agree", "target") to null so the UI
    // doesn't try to render an icon for a retired reaction.
    const rawReaction = parsed.clayReaction;
    const clayReaction =
      typeof rawReaction === "string" &&
      VALID_REACTIONS.includes(rawReaction as ClayReaction)
        ? (rawReaction as ClayReaction)
        : null;
    return {
      ...(parsed as Note),
      clayReaction,
      clayReactedAt: clayReaction ? (parsed.clayReactedAt ?? null) : null,
      replyEmailedAt: parsed.replyEmailedAt ?? null,
    };
  } catch {
    return null;
  }
}

/* === CRUD ================================================== */

export type CreateNoteInput = {
  email: string;
  displayName: string;
  body: string;
  visibility: NoteVisibility;
};

export type CreateNoteResult =
  | { ok: true; note: Note }
  | { ok: false; error: "storage_unavailable" | "empty_body" | "admin_self_post" };

/**
 * Create a new note from a member. Admin emails are rejected — Clay
 * shouldn't be writing notes to himself. Returns the created record
 * on success.
 */
export async function createNote(
  input: CreateNoteInput
): Promise<CreateNoteResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  if (isAdmin(input.email)) {
    return { ok: false, error: "admin_self_post" };
  }

  const body = sanitizeBody(input.body, MAX_BODY);
  if (!body) return { ok: false, error: "empty_body" };

  const fromName = sanitizeName(input.displayName) || "";
  const id = randomUUID();
  const now = Date.now();
  // Visibility is forced to "private" — notes are the direct-to-Clay
  // channel; public room talk lives in the Lounge. The field stays in
  // the data model since older records may still be `public` until
  // they're flipped, and `maxReplyLengthFor()` still keys off it.
  const note: Note = {
    id,
    fromEmail: normEmail(input.email),
    fromName,
    body,
    visibility: "private",
    createdAt: now,
    clayReply: null,
    replyEmailedAt: null,
    clayRepliedAt: null,
    clayReaction: null,
    clayReactedAt: null,
    status: "new",
  };

  await client.set(`${NOTE_PREFIX}${id}`, JSON.stringify(note));
  await client.zadd(NOTES_INDEX, { score: now, member: id });
  await client.zadd(`${MEMBER_NOTES_PREFIX}${note.fromEmail}`, {
    score: now,
    member: id,
  });

  return { ok: true, note };
}

export async function getNote(id: string): Promise<Note | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${NOTE_PREFIX}${id}`);
  return parseNote(raw);
}

async function bulkFetch(ids: string[]): Promise<Note[]> {
  const client = getClient();
  if (!client || ids.length === 0) return [];
  const keys = ids.map((id) => `${NOTE_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: Note[] = [];
  for (const value of raw) {
    const parsed = parseNote(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

export type ListAllFilters = {
  /**
   * Status filter. Special values:
   *   - "active" — everything except archived (the default working set)
   *   - "all"    — literally everything, archived included
   *   - a NoteStatus — exact match
   */
  status?: NoteStatus | "all" | "active";
  visibility?: NoteVisibility | "all";
  limit?: number;
};

/**
 * Admin-side listing. Newest first. Filters applied in code after the
 * sorted-set walk — fine while notes count is small; a per-status
 * sorted index would scale better long-term.
 */
export async function listAll(
  filters: ListAllFilters = {}
): Promise<Note[]> {
  const client = getClient();
  if (!client) return [];
  const limit = Math.max(1, Math.min(200, filters.limit ?? 100));
  const ids = (await client.zrange(NOTES_INDEX, 0, limit - 1, {
    rev: true,
  })) as string[];
  let notes = await bulkFetch(ids);
  if (filters.status === "active") {
    notes = notes.filter((n) => n.status !== "archived");
  } else if (filters.status && filters.status !== "all") {
    notes = notes.filter((n) => n.status === filters.status);
  }
  if (filters.visibility && filters.visibility !== "all") {
    notes = notes.filter((n) => n.visibility === filters.visibility);
  }
  return notes.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Member-side listing. Returns notes authored by the given email,
 * newest first. Archived notes are filtered out — archiving is the
 * "delete from the member's view" action even though the record
 * stays on disk for admin recall.
 */
export async function listByMember(
  email: string,
  limit = 20
): Promise<Note[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(
    `${MEMBER_NOTES_PREFIX}${normEmail(email)}`,
    0,
    limit - 1,
    { rev: true }
  )) as string[];
  const notes = await bulkFetch(ids);
  return notes
    .filter((n) => n.status !== "archived")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function countByStatus(): Promise<
  Record<NoteStatus, number> | null
> {
  const all = await listAll({ limit: 200 });
  const counts: Record<NoteStatus, number> = {
    new: 0,
    read: 0,
    replied: 0,
    archived: 0,
  };
  for (const n of all) counts[n.status] += 1;
  return counts;
}

export async function setStatus(
  id: string,
  status: NoteStatus
): Promise<Note | null> {
  const client = getClient();
  if (!client) return null;
  const note = await getNote(id);
  if (!note) return null;
  const next: Note = { ...note, status };
  await client.set(`${NOTE_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

export type SetReplyResult =
  | { ok: true; note: Note }
  | { ok: false; error: "not_found" | "empty_reply" | "storage_unavailable" };

/**
 * Maximum reply length. Now one number regardless of visibility.
 *
 * This used to return the 150-char MAX_BODY for public notes, to keep
 * a public feed reading as short Q / short A. That feed doesn't exist:
 * a reply renders in PastNotes, which shows a member their OWN notes,
 * with whitespace-pre-wrap and no clamp. Nothing about the layout was
 * being protected, and 150 was simply too short to answer anyone. The
 * private branch was dead code besides, since every note is public now.
 *
 * Signature kept so callers don't churn.
 */
export function maxReplyLengthFor(_visibility: NoteVisibility): number {
  return MAX_REPLY;
}

/**
 * Persist Clay's reply on the note record and flip status to
 * "replied". Doesn't dispatch the email — caller does that so the
 * route can short-circuit cleanly on send failures without leaving
 * a half-applied state.
 *
 * Reply cap is visibility-aware: 150 chars on public notes (matches
 * the member submission cap, keeps the public feed terse), 2000 on
 * private notes (email-style reply, no display constraint).
 */
export async function setReply(
  id: string,
  body: string
): Promise<SetReplyResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const note = await getNote(id);
  if (!note) return { ok: false, error: "not_found" };
  const cap = maxReplyLengthFor(note.visibility);
  const cleaned = sanitizeBody(body, cap);
  if (!cleaned) return { ok: false, error: "empty_reply" };
  const next: Note = {
    ...note,
    clayReply: cleaned,
    clayRepliedAt: Date.now(),
    // New text means the member hasn't been emailed THIS reply yet.
    replyEmailedAt:
      cleaned === note.clayReply ? note.replyEmailedAt : null,
    status: "replied",
  };
  await client.set(`${NOTE_PREFIX}${id}`, JSON.stringify(next));
  return { ok: true, note: next };
}

/** Stamp a successful reply-email send, so an unchanged re-save skips
    the send but a failed one stays retryable. */
export async function markReplyEmailed(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const note = await getNote(id);
  if (!note) return;
  await client.set(
    `${NOTE_PREFIX}${id}`,
    JSON.stringify({ ...note, replyEmailedAt: Date.now() })
  );
}

/**
 * Set or clear Clay's reaction on a note. Reactions are independent
 * of replies — Clay can react, reply, both, or neither. Passing null
 * clears the reaction.
 */
export async function setReaction(
  id: string,
  reaction: ClayReaction | null
): Promise<
  | { ok: true; note: Note }
  | { ok: false; error: "not_found" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const note = await getNote(id);
  if (!note) return { ok: false, error: "not_found" };
  const next: Note = {
    ...note,
    clayReaction: reaction,
    clayReactedAt: reaction === null ? null : Date.now(),
  };
  await client.set(`${NOTE_PREFIX}${id}`, JSON.stringify(next));
  return { ok: true, note: next };
}

/* === Field Note conversion helper ========================== */

/**
 * Generate a starter Field Note markdown body from a public note +
 * Clay's reply. Returned as a single string the admin can copy into
 * a new file under content/field-notes/. No filesystem write here —
 * keeps the conversion explicit and reviewable.
 */
export function toFieldNoteMarkdown(note: Note): string {
  const reply = note.clayReply ?? "";
  const date = new Date(note.createdAt).toISOString().slice(0, 10);
  const frontmatter = [
    "---",
    'title: "TBD — title from Clay\'s reply"',
    "number: TBD",
    `date: ${date}`,
    `doctrine_tags: []`,
    "---",
    "",
  ].join("\n");
  const intro =
    `A reader (${note.fromName || "a member"}) left this on the desk:\n\n` +
    `> ${note.body.replace(/\n/g, "\n> ")}\n\n`;
  const body =
    reply.length > 0
      ? `Here's what I told them.\n\n${reply}\n`
      : `[Reply not yet written]\n`;
  return frontmatter + intro + body;
}
