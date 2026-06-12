import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Unified store for admin-curated social posts that surface in the
// Writer's Desk "Elsewhere" section. Each source lives in its own
// parallel zset so the aggregator can pull each lane independently and
// merge them by recency.
//
// Redis schema:
//   channels:fb            ZSET, score=postedAt, member=id  (FB lane)
//   channels:x             ZSET, score=postedAt, member=id  (X lane)
//   channels:youtube       ZSET, score=postedAt, member=id  (YouTube lane)
//   channel-post:<id>      JSON ChannelPost

const RECORD_PREFIX = "channel-post:";

export type ChannelSource = "fb" | "x" | "youtube";

// Every lane the store knows about. Used to iterate sources in the
// combined list/delete paths so adding a source is a one-line change.
const ALL_SOURCES: ChannelSource[] = ["fb", "x", "youtube"];

export type ChannelPost = {
  id: string;
  source: ChannelSource;
  /** Direct link to the post on facebook.com / x.com / youtube.com. */
  url: string;
  /** First-line preview shown in the feed (≤ 100 chars). */
  text: string;
  /** When the post went up on the source platform (epoch ms).
      Drives the feed ordering. */
  postedAt: number;
  /** When the admin added it here (epoch ms). Bookkeeping only. */
  createdAt: number;
};

const MAX_TEXT = 100;
const MAX_URL = 500;

function indexKey(source: ChannelSource): string {
  return `channels:${source}`;
}

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isChannelPostsConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

// Host allowlists per source. Sub-domains and mobile variants are
// included so a paste from a mobile share sheet still validates.
const FB_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "mbasic.facebook.com",
  "fb.com",
  "www.fb.com",
  "fb.watch",
]);
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const HOSTS_BY_SOURCE: Record<ChannelSource, Set<string>> = {
  fb: FB_HOSTS,
  x: X_HOSTS,
  youtube: YOUTUBE_HOSTS,
};

function sanitizeUrl(input: string, source: ChannelSource): string | null {
  const trimmed = input.trim().slice(0, MAX_URL);
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const allow = HOSTS_BY_SOURCE[source];
  if (!allow.has(host)) return null;
  return parsed.toString();
}

function isSource(v: unknown): v is ChannelSource {
  return v === "fb" || v === "x" || v === "youtube";
}

function parsePost(raw: unknown): ChannelPost | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<ChannelPost>)
        : (raw as Partial<ChannelPost>);
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.url !== "string" ||
      typeof parsed.text !== "string" ||
      typeof parsed.postedAt !== "number" ||
      !isSource(parsed.source)
    ) {
      return null;
    }
    return {
      id: parsed.id,
      source: parsed.source,
      url: parsed.url,
      text: parsed.text,
      postedAt: parsed.postedAt,
      createdAt:
        typeof parsed.createdAt === "number"
          ? parsed.createdAt
          : parsed.postedAt,
    };
  } catch {
    return null;
  }
}

export type CreateChannelPostInput = {
  source: ChannelSource;
  url: string;
  text: string;
  /** ISO date string (e.g. from a datetime-local input via toISOString()). */
  postedAt: string;
};

export type CreateChannelPostResult =
  | { ok: true; post: ChannelPost }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "invalid_source"
        | "invalid_url"
        | "empty_text"
        | "invalid_date";
    };

export async function createChannelPost(
  input: CreateChannelPostInput
): Promise<CreateChannelPostResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (!isSource(input.source)) return { ok: false, error: "invalid_source" };

  const url = sanitizeUrl(input.url, input.source);
  if (!url) return { ok: false, error: "invalid_url" };

  const text = sanitizeText(input.text);
  if (!text) return { ok: false, error: "empty_text" };

  const postedAtMs = Date.parse(input.postedAt);
  if (!Number.isFinite(postedAtMs)) {
    return { ok: false, error: "invalid_date" };
  }

  const id = randomUUID();
  const now = Date.now();
  const post: ChannelPost = {
    id,
    source: input.source,
    url,
    text,
    postedAt: postedAtMs,
    createdAt: now,
  };

  await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(post));
  await client.zadd(indexKey(input.source), {
    score: postedAtMs,
    member: id,
  });
  return { ok: true, post };
}

async function bulkFetch(ids: string[]): Promise<ChannelPost[]> {
  const client = getClient();
  if (!client || ids.length === 0) return [];
  const keys = ids.map((id) => `${RECORD_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: ChannelPost[] = [];
  for (const value of raw) {
    const parsed = parsePost(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

export type ListChannelPostsFilters = {
  source?: ChannelSource;
  limit?: number;
};

export async function listChannelPosts(
  filters: ListChannelPostsFilters = {}
): Promise<ChannelPost[]> {
  const client = getClient();
  if (!client) return [];
  const limit = Math.max(1, Math.min(200, filters.limit ?? 50));

  // Per-source: walk that source's zset only.
  if (filters.source) {
    const ids = (await client.zrange(indexKey(filters.source), 0, limit - 1, {
      rev: true,
    })) as string[];
    const posts = await bulkFetch(ids);
    return posts.sort((a, b) => b.postedAt - a.postedAt);
  }

  // Combined: pull every lane in parallel, merge, slice.
  const perLane = await Promise.all(
    ALL_SOURCES.map(
      (s) =>
        client.zrange(indexKey(s), 0, limit - 1, { rev: true }) as Promise<
          string[]
        >
    )
  );
  const all = await bulkFetch(perLane.flat());
  return all.sort((a, b) => b.postedAt - a.postedAt).slice(0, limit);
}

export async function deleteChannelPost(
  id: string
): Promise<
  | { ok: true }
  | { ok: false; error: "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  // Idempotent: remove from every lane index and the record key. If
  // the record's already gone the end state still matches the admin's
  // intent.
  await Promise.all(ALL_SOURCES.map((s) => client.zrem(indexKey(s), id)));
  await client.del(`${RECORD_PREFIX}${id}`);
  return { ok: true };
}
