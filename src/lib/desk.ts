import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Writer's Desk — a single live status note pinned to the top of the
// DEN. Clay writes one short status from /admin/desk; members see it
// alongside the presence indicator. The status is ephemeral: posting a
// new one *replaces* the prior one, and deleting clears the slot
// entirely. There is no history — the widget shows whatever Clay's
// current note is, and nothing when there isn't one.
//
// Also tracks Clay's "at the desk" presence so the widget can pulse
// when he's actively here. Three derived states:
//   - active           session flag on + lastActivityAt within 4h
//   - recently-active  lastActivityAt within 24h
//   - quiet            anything older
//
// Redis schema:
//   desk:updates             ZSET, score=createdAt, member=id
//                            (kept for backwards compat; invariant
//                            enforced at write time so it holds at
//                            most one entry)
//   desk:<id>                JSON DeskUpdate
//   desk:presence            JSON DeskPresence

const UPDATES_INDEX = "desk:updates";
const UPDATE_PREFIX = "desk:";
const PRESENCE_KEY = "desk:presence";

const ACTIVE_SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const FRESH_UPDATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export type DeskUpdate = {
  id: string;
  body: string;
  createdAt: number;
};

const MAX_BODY = 600;

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isDeskConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function sanitizeBody(input: string): string {
  // Same shape as comments: strip HTML brackets + C0 controls (keep LF),
  // collapse 3+ newlines, cap length.
  const noControl = input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "");
  const collapsed = noControl.replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.slice(0, MAX_BODY);
}

function parseUpdate(raw: unknown): DeskUpdate | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as DeskUpdate)
      : (raw as DeskUpdate);
  } catch {
    return null;
  }
}

/**
 * Newest-first list of recent desk updates. Capped at `limit` (default 5).
 */
export async function listRecentUpdates(limit = 5): Promise<DeskUpdate[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(UPDATES_INDEX, 0, limit - 1, {
    rev: true,
  })) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${UPDATE_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: DeskUpdate[] = [];
  for (const value of raw) {
    const parsed = parseUpdate(value);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Replace the current desk update. The status slot holds at most one
 * note — posting a new one sweeps any prior entries first, so the
 * widget can never surface "history." Returns the created record or
 * an error.
 */
export async function addUpdate(
  body: string
): Promise<
  | { ok: true; update: DeskUpdate }
  | { ok: false; error: "empty_body" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const clean = sanitizeBody(body);
  if (!clean) return { ok: false, error: "empty_body" };

  // Sweep any prior entries before writing the new one. Enforces the
  // single-status invariant: if old code or a manual write left extra
  // entries in the ZSET, they're cleared here so a delete can't
  // resurrect them.
  const priorIds = (await client.zrange(UPDATES_INDEX, 0, -1)) as string[];
  if (priorIds.length > 0) {
    await Promise.all([
      ...priorIds.map((priorId) => client.del(`${UPDATE_PREFIX}${priorId}`)),
      client.del(UPDATES_INDEX),
    ]);
  }

  const id = randomUUID();
  const now = Date.now();
  const update: DeskUpdate = { id, body: clean, createdAt: now };

  await client.set(`${UPDATE_PREFIX}${id}`, JSON.stringify(update));
  await client.zadd(UPDATES_INDEX, { score: now, member: id });

  // Posting an update implicitly says "I'm here." Bump lastActivityAt
  // so the green/grey indicator stays honest without Clay needing to
  // separately confirm presence after every post.
  await bumpLastActivity();

  return { ok: true, update };
}

export async function deleteUpdate(
  id: string
): Promise<
  | { ok: true }
  | { ok: false; error: "not_found" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  // "Delete" clears the entire slot, not just the passed id. The slot
  // is conceptually a single live status; emptying it should never
  // resurface an older entry. The id is accepted for API
  // backwards-compat but isn't load-bearing.
  void id;
  const allIds = (await client.zrange(UPDATES_INDEX, 0, -1)) as string[];
  if (allIds.length > 0) {
    await Promise.all([
      ...allIds.map((priorId) => client.del(`${UPDATE_PREFIX}${priorId}`)),
      client.del(UPDATES_INDEX),
    ]);
  }
  return { ok: true };
}

/* === Presence ============================================== */

export type DeskPresence = {
  /** Whether Clay has flagged himself "at the desk" in a session
      that hasn't been ended or aged out. */
  active: boolean;
  /** When the current session started (0 if no session). */
  sessionStartedAt: number;
  /** Last time Clay did anything (started session, posted update). */
  lastActivityAt: number;
  /** True if the most recent transition to !active came from an
      explicit "End session" click. False covers auto-expired sessions
      AND fresh installs — both render as "stepped away". */
  endedManually: boolean;
  /** When the manual end happened. 0 when never manually ended. */
  endedAt: number;
  /** Optional note Clay leaves on his way out. Empty string when none.
      Auto-cleared from display 24h after `awayNoteSetAt`. */
  awayNote: string;
  /** When the away note was set. Used for the 24h auto-clear window. */
  awayNoteSetAt: number;
};

export type PresenceState = "active" | "manually-away" | "auto-expired";

const EMPTY_PRESENCE: DeskPresence = {
  active: false,
  sessionStartedAt: 0,
  lastActivityAt: 0,
  endedManually: false,
  endedAt: 0,
  awayNote: "",
  awayNoteSetAt: 0,
};

function parsePresence(raw: unknown): DeskPresence {
  if (raw === null || raw === undefined) return EMPTY_PRESENCE;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<DeskPresence>)
        : (raw as Partial<DeskPresence>);
    return {
      active: !!parsed.active,
      sessionStartedAt:
        typeof parsed.sessionStartedAt === "number"
          ? parsed.sessionStartedAt
          : 0,
      lastActivityAt:
        typeof parsed.lastActivityAt === "number"
          ? parsed.lastActivityAt
          : 0,
      endedManually: !!parsed.endedManually,
      endedAt:
        typeof parsed.endedAt === "number" ? parsed.endedAt : 0,
      awayNote:
        typeof parsed.awayNote === "string" ? parsed.awayNote : "",
      awayNoteSetAt:
        typeof parsed.awayNoteSetAt === "number"
          ? parsed.awayNoteSetAt
          : 0,
    };
  } catch {
    return EMPTY_PRESENCE;
  }
}

/**
 * Raw presence record from storage. Use derivePresenceState() to turn
 * this into the displayable three-state value (the active flag alone
 * isn't enough — sessions auto-age-out after 4h).
 */
export async function getPresence(): Promise<DeskPresence> {
  const client = getClient();
  if (!client) return EMPTY_PRESENCE;
  const raw = await client.get<string>(PRESENCE_KEY);
  return parsePresence(raw);
}

/**
 * Compute the displayable presence state from raw + the current time:
 *   - "active": session on AND lastActivityAt within 4h.
 *   - "manually-away": last transition to !active was an explicit
 *     "End session" click. Persists until the next session starts,
 *     regardless of how long ago it happened.
 *   - "auto-expired": everything else — ghosted sessions, fresh
 *     installs, ancient state.
 */
export function derivePresenceState(
  presence: DeskPresence,
  now: number = Date.now()
): PresenceState {
  if (
    presence.active &&
    presence.lastActivityAt > 0 &&
    now - presence.lastActivityAt < ACTIVE_SESSION_TIMEOUT_MS
  ) {
    return "active";
  }
  if (presence.endedManually && presence.endedAt > 0) {
    return "manually-away";
  }
  return "auto-expired";
}

/**
 * Whether Clay's away note is still in its 24-hour display window.
 * Returns the note text if so, null otherwise. Existing storage state
 * isn't mutated on read; the lib treats the note as cleared but only
 * physically wipes it on next session start or explicit clear.
 */
export function getActiveAwayNote(
  presence: DeskPresence,
  now: number = Date.now()
): string | null {
  if (!presence.awayNote) return null;
  if (presence.awayNoteSetAt <= 0) return null;
  if (now - presence.awayNoteSetAt > RECENT_WINDOW_MS) return null;
  return presence.awayNote;
}

async function writePresence(p: DeskPresence): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(PRESENCE_KEY, JSON.stringify(p));
}

const AWAY_NOTE_MAX = 200;

function sanitizeAwayNote(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .trim()
    .slice(0, AWAY_NOTE_MAX);
}

/**
 * Toggle the "at the desk" flag.
 *   - `start` mints a fresh session, bumps lastActivityAt, and clears
 *     any prior away-note (a fresh session shouldn't carry a stale
 *     goodbye line).
 *   - `end` clears the active flag, stamps endedAt + endedManually so
 *     the widget reads "Clay is away from the desk", and optionally
 *     stores an away note for the next 24 hours.
 */
export async function setSession(
  action: "start" | "end",
  awayNote?: string
): Promise<DeskPresence> {
  const now = Date.now();
  if (action === "start") {
    const next: DeskPresence = {
      active: true,
      sessionStartedAt: now,
      lastActivityAt: now,
      endedManually: false,
      endedAt: 0,
      awayNote: "",
      awayNoteSetAt: 0,
    };
    await writePresence(next);
    return next;
  }
  // end
  const existing = await getPresence();
  const cleaned = awayNote ? sanitizeAwayNote(awayNote) : "";
  const next: DeskPresence = {
    active: false,
    sessionStartedAt: 0,
    lastActivityAt: existing.lastActivityAt || now,
    endedManually: true,
    endedAt: now,
    awayNote: cleaned,
    awayNoteSetAt: cleaned ? now : 0,
  };
  await writePresence(next);
  // Going away also clears the latest status. The away-note IS Clay's
  // status while he's gone; leaving an active-session status note
  // pinned beside "Clay is away from the desk" reads as out of date
  // on both the admin view and the public Desk widget, and he was
  // hitting the manual X every time anyway.
  await deleteUpdate("").catch(() => null);
  return next;
}

/**
 * Edit (or clear) the away note while offline. Passing an empty
 * string clears the note. If Clay's last session auto-expired (he
 * never clicked End session) and he's now setting a note, treat that
 * as a retroactive goodbye so the widget shows the note alongside
 * "Clay is away from the desk" rather than "Clay stepped away".
 */
export async function setAwayNote(note: string): Promise<DeskPresence> {
  const existing = await getPresence();
  const cleaned = sanitizeAwayNote(note);
  const now = Date.now();
  const next: DeskPresence = {
    ...existing,
    awayNote: cleaned,
    awayNoteSetAt: cleaned ? now : 0,
  };
  if (
    !existing.active &&
    !existing.endedManually &&
    cleaned.length > 0
  ) {
    next.endedManually = true;
    next.endedAt = now;
  }
  await writePresence(next);
  return next;
}

/**
 * Bump lastActivityAt. Used by addUpdate so posting a status
 * implicitly keeps the session alive. Does NOT change the active
 * flag — Clay must toggle that explicitly.
 */
async function bumpLastActivity(): Promise<void> {
  const existing = await getPresence();
  const next: DeskPresence = { ...existing, lastActivityAt: Date.now() };
  await writePresence(next);
}

/**
 * Keepalive for an open admin desk. Refreshes `lastActivityAt` so simply
 * having the desk open and focused keeps the "at the desk" status from
 * aging out at the 4h mark, without Clay needing to post anything.
 *
 * Critically, it only extends a session that is CURRENTLY active (flag on
 * AND within the 4h window). It never revives a session that already
 * auto-expired or was ended manually — reviving one requires an explicit
 * "start". So a forgotten background tab still times out honestly, and a
 * stray ping after Clay has actually left can't resurrect his presence.
 * `bumped` reports whether the timer was actually refreshed.
 */
export async function keepAlive(
  now: number = Date.now()
): Promise<{ presence: DeskPresence; bumped: boolean }> {
  const existing = await getPresence();
  if (derivePresenceState(existing, now) !== "active") {
    return { presence: existing, bumped: false };
  }
  const next: DeskPresence = { ...existing, lastActivityAt: now };
  await writePresence(next);
  return { presence: next, bumped: true };
}

/**
 * Whether an update counts as a "fresh post" for the highlight
 * animation — defined as posted within the last 15 minutes AND
 * (when checked) after the current session's start. The widget
 * passes session start in, so the test stays pure.
 */
export function isFreshUpdate(
  update: DeskUpdate,
  sessionStartedAt: number,
  now: number = Date.now()
): boolean {
  if (now - update.createdAt > FRESH_UPDATE_WINDOW_MS) return false;
  if (sessionStartedAt > 0 && update.createdAt < sessionStartedAt) return false;
  return true;
}
