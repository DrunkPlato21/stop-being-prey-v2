import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// The Watch Feed — live broadcast feed pinned to the top of /lounge
// during host-led events. Clay drops a short post (text + optional
// link); members see the card appear in their feed within a few
// seconds via poll. Unlike the Writer's Desk status slot (single
// pinned note), the Watch Feed is a stack — newest first, cap at
// MAX_POSTS, older entries fall off the bottom.
//
// Redis schema:
//   watch:posts        ZSET, score=createdAt, member=id
//   watch:posts:<id>   JSON WatchPost
//
// Caps at MAX_POSTS most recent. Older entries are trimmed at write
// time (sweep oldest beyond the cap) so the read path can stay a
// simple zrange.

const INDEX_KEY = "watch:posts";
const POST_PREFIX = "watch:posts:";
// On/off switch for showing the Watch Feed (Wire + Billboard) on the
// live lounge. Off by default — the feed only appears to members when
// Clay flips it on for an event.
const ENABLED_KEY = "watch:enabled";

const MAX_POSTS = 50;
const MAX_BODY = 600;
const MAX_LINK = 2048;

export type WatchPost = {
  id: string;
  body: string;
  link: string | null;
  createdAt: number;
  hostEmail: string;
  // Voice-note fields. Null on text-only posts. When `audioUrl` is set
  // the card renders as a voice note and `body` is its caption (the
  // hook shown on the card, the line shown in The Wire, and the text
  // fallback for anyone who can't play audio). Audio lives in Vercel
  // Blob; `audioPathname` is kept so deletion can free the object.
  audioUrl: string | null;
  audioPathname: string | null;
  durationSeconds: number | null;
};

let cachedClient: Redis | null = null;

function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isWatchFeedConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/**
 * Whether the Watch Feed is currently shown to members on the lounge.
 * Off unless explicitly enabled — so a stale feed never resurfaces on
 * its own.
 */
export async function isWatchFeedEnabled(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const raw = await client.get<number | string | boolean>(ENABLED_KEY).catch(
    () => null
  );
  return raw === 1 || raw === "1" || raw === true || raw === "true";
}

/** Flip the member-facing Watch Feed on or off. Returns the new state. */
export async function setWatchFeedEnabled(on: boolean): Promise<boolean> {
  const client = getClient();
  if (!client) return on;
  await client.set(ENABLED_KEY, on ? 1 : 0).catch(() => null);
  return on;
}

/* === Custom Wire lines =====================================
   Host-authored one-liners that scroll in the Wire alongside the live
   activity (arrivals, headcount) and older bulletins — an editorial
   lane for things like "TONIGHT: open hang till 9" or a teaser. Pure
   ticker text; not lounge posts, not Billboard bulletins. Stored as a
   small JSON array under one key — the list is short, so add/remove
   just rewrites it. */

const WIRE_LINES_KEY = "watch:wire:lines";
const MAX_WIRE_LINES = 20;
const MAX_WIRE_LINE_LEN = 140;

export type WireLine = { id: string; text: string };

function sanitizeWireLine(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WIRE_LINE_LEN);
}

export async function listWireLines(): Promise<WireLine[]> {
  const client = getClient();
  if (!client) return [];
  const raw = await client.get<unknown>(WIRE_LINES_KEY).catch(() => null);
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: WireLine[] = [];
  for (const item of arr) {
    const text = (item as { text?: unknown })?.text;
    const id = (item as { id?: unknown })?.id;
    if (typeof text === "string" && text.length > 0) {
      out.push({ id: typeof id === "string" ? id : randomUUID(), text });
    }
  }
  return out;
}

export async function addWireLine(text: string): Promise<WireLine[]> {
  const client = getClient();
  if (!client) return [];
  const clean = sanitizeWireLine(text);
  if (!clean) return listWireLines();
  const lines = await listWireLines();
  const next = [...lines, { id: randomUUID(), text: clean }].slice(
    -MAX_WIRE_LINES
  );
  await client.set(WIRE_LINES_KEY, JSON.stringify(next)).catch(() => null);
  return next;
}

export async function removeWireLine(id: string): Promise<WireLine[]> {
  const client = getClient();
  if (!client) return [];
  const lines = await listWireLines();
  const next = lines.filter((l) => l.id !== id);
  await client.set(WIRE_LINES_KEY, JSON.stringify(next)).catch(() => null);
  return next;
}

function sanitizeBody(input: string): string {
  // Mirrors desk.ts: strip HTML brackets + C0 controls (keep LF),
  // collapse 3+ newlines, cap length.
  const noControl = input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "");
  const collapsed = noControl.replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.slice(0, MAX_BODY);
}

function sanitizeLink(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Only http/https. Keeps mailto:, javascript:, data: etc. off the
  // card. Length cap defends against pathological URLs.
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.slice(0, MAX_LINK);
}

function parsePost(raw: unknown): WatchPost | null {
  if (raw === null || raw === undefined) return null;
  try {
    const obj =
      typeof raw === "string" ? (JSON.parse(raw) as WatchPost) : (raw as WatchPost);
    if (typeof obj.id !== "string") return null;
    if (typeof obj.body !== "string") return null;
    if (typeof obj.createdAt !== "number") return null;
    return {
      id: obj.id,
      body: obj.body,
      link:
        typeof obj.link === "string" && obj.link.length > 0 ? obj.link : null,
      createdAt: obj.createdAt,
      hostEmail: typeof obj.hostEmail === "string" ? obj.hostEmail : "",
      audioUrl:
        typeof obj.audioUrl === "string" && obj.audioUrl.length > 0
          ? obj.audioUrl
          : null,
      audioPathname:
        typeof obj.audioPathname === "string" && obj.audioPathname.length > 0
          ? obj.audioPathname
          : null,
      durationSeconds:
        typeof obj.durationSeconds === "number" &&
        Number.isFinite(obj.durationSeconds)
          ? obj.durationSeconds
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Newest-first list of recent watch posts. Capped at `limit`
 * (default MAX_POSTS).
 */
export async function listWatchPosts(limit = MAX_POSTS): Promise<WatchPost[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(INDEX_KEY, 0, limit - 1, {
    rev: true,
  })) as string[];
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `${POST_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: WatchPost[] = [];
  for (const value of raw) {
    const parsed = parsePost(value);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Push a new post onto the feed. Trims oldest entries beyond MAX_POSTS
 * so the read path can stay a simple zrange.
 */
export async function addWatchPost(input: {
  body: string;
  link?: string;
  hostEmail: string;
  // Optional voice-note payload. When `audioUrl` is provided the post
  // is a voice note; otherwise it's a plain text bulletin.
  audioUrl?: string;
  audioPathname?: string;
  durationSeconds?: number;
}): Promise<
  | { ok: true; post: WatchPost }
  | { ok: false; error: "empty_body" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const body = sanitizeBody(input.body);
  if (!body) return { ok: false, error: "empty_body" };

  const link = input.link ? sanitizeLink(input.link) : null;

  const audioUrl =
    typeof input.audioUrl === "string" && input.audioUrl.length > 0
      ? input.audioUrl
      : null;
  const audioPathname =
    typeof input.audioPathname === "string" && input.audioPathname.length > 0
      ? input.audioPathname
      : null;
  const durationSeconds =
    typeof input.durationSeconds === "number" &&
    Number.isFinite(input.durationSeconds)
      ? Math.round(input.durationSeconds)
      : null;

  const id = randomUUID();
  const now = Date.now();
  const post: WatchPost = {
    id,
    body,
    link,
    createdAt: now,
    hostEmail: input.hostEmail,
    audioUrl,
    audioPathname,
    durationSeconds,
  };

  await client.set(`${POST_PREFIX}${id}`, JSON.stringify(post));
  await client.zadd(INDEX_KEY, { score: now, member: id });

  // Trim past the cap. zrange with negative indices isn't supported
  // in the rev direction here, so we count + clear the oldest.
  const total = await client.zcard(INDEX_KEY);
  if (total > MAX_POSTS) {
    const overflow = total - MAX_POSTS;
    const oldest = (await client.zrange(INDEX_KEY, 0, overflow - 1)) as string[];
    if (oldest.length > 0) {
      await Promise.all([
        ...oldest.map((oldId) => client.del(`${POST_PREFIX}${oldId}`)),
        client.zrem(INDEX_KEY, ...oldest),
      ]);
    }
  }

  return { ok: true, post };
}

export async function deleteWatchPost(
  id: string
): Promise<
  | { ok: true; post: WatchPost | null }
  | { ok: false; error: "not_found" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  // Read the record first so the caller can free the underlying blob
  // (this lib stays decoupled from Blob storage, same as voice-memos).
  const raw = await client.get<string>(`${POST_PREFIX}${id}`);
  const post = parsePost(raw);

  const removed = await client.zrem(INDEX_KEY, id);
  if (removed === 0) return { ok: false, error: "not_found" };
  await client.del(`${POST_PREFIX}${id}`);
  return { ok: true, post };
}
