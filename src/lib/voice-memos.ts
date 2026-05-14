import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Voice memos for the Writer's Desk. Clay records a short audio update
// (60-90s), uploads it from /admin/desk/voice, and members see/play the
// latest one inside the desk widget. Metadata lives in Upstash; the
// audio file itself lives in Vercel Blob (publicly readable URL stored
// here as `audioUrl`).
//
// Redis schema:
//   voice-memos:all     ZSET, score=createdAt, member=id
//   voice-memo:<id>     JSON VoiceMemo

const INDEX_KEY = "voice-memos:all";
const MEMO_PREFIX = "voice-memo:";

export type VoiceMemoStatus = "published" | "draft";

export type VoiceMemo = {
  id: string;
  title: string;
  /** Public URL served by Vercel Blob. */
  audioUrl: string;
  /** Blob pathname — kept so deletion can free the underlying object. */
  audioPathname: string;
  durationSeconds: number;
  transcript: string | null;
  status: VoiceMemoStatus;
  createdAt: number;
  /** Set to the publish time; nulled when reverted to draft. */
  publishedAt: number | null;
};

const MAX_TITLE = 120;
const MAX_TRANSCRIPT = 10_000;
export const MAX_DURATION_SECONDS = 90;
export const MIN_DURATION_SECONDS = 1;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isVoiceMemosConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function sanitizeTitle(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE);
}

function sanitizeTranscript(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TRANSCRIPT);
}

function parseMemo(raw: unknown): VoiceMemo | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<VoiceMemo>)
        : (raw as Partial<VoiceMemo>);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string" || typeof parsed.audioUrl !== "string") {
      return null;
    }
    return {
      id: parsed.id,
      title: typeof parsed.title === "string" ? parsed.title : "Untitled",
      audioUrl: parsed.audioUrl,
      audioPathname:
        typeof parsed.audioPathname === "string" ? parsed.audioPathname : "",
      durationSeconds:
        typeof parsed.durationSeconds === "number" ? parsed.durationSeconds : 0,
      transcript:
        typeof parsed.transcript === "string" && parsed.transcript.length > 0
          ? parsed.transcript
          : null,
      status: parsed.status === "draft" ? "draft" : "published",
      createdAt:
        typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      publishedAt:
        typeof parsed.publishedAt === "number" ? parsed.publishedAt : null,
    };
  } catch {
    return null;
  }
}

export type CreateMemoInput = {
  title: string;
  audioUrl: string;
  audioPathname: string;
  durationSeconds: number;
  transcript: string | null;
  publish: boolean;
};

export type CreateMemoResult =
  | { ok: true; memo: VoiceMemo }
  | {
      ok: false;
      error: "storage_unavailable" | "invalid_duration";
    };

export async function createMemo(
  input: CreateMemoInput
): Promise<CreateMemoResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds < MIN_DURATION_SECONDS ||
    input.durationSeconds > MAX_DURATION_SECONDS
  ) {
    return { ok: false, error: "invalid_duration" };
  }

  const id = randomUUID();
  const now = Date.now();
  const memo: VoiceMemo = {
    id,
    title: sanitizeTitle(input.title) || "Untitled voice memo",
    audioUrl: input.audioUrl,
    audioPathname: input.audioPathname,
    durationSeconds: Math.round(input.durationSeconds),
    transcript: input.transcript
      ? sanitizeTranscript(input.transcript) || null
      : null,
    status: input.publish ? "published" : "draft",
    createdAt: now,
    publishedAt: input.publish ? now : null,
  };

  await client.set(`${MEMO_PREFIX}${id}`, JSON.stringify(memo));
  await client.zadd(INDEX_KEY, { score: now, member: id });
  return { ok: true, memo };
}

export async function getMemo(id: string): Promise<VoiceMemo | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${MEMO_PREFIX}${id}`);
  return parseMemo(raw);
}

async function bulkFetch(ids: string[]): Promise<VoiceMemo[]> {
  const client = getClient();
  if (!client || ids.length === 0) return [];
  const keys = ids.map((id) => `${MEMO_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: VoiceMemo[] = [];
  for (const value of raw) {
    const parsed = parseMemo(value);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Admin-side listing. Newest first. Includes drafts and published.
 */
export async function listAll(limit = 50): Promise<VoiceMemo[]> {
  const client = getClient();
  if (!client) return [];
  const ids = (await client.zrange(INDEX_KEY, 0, limit - 1, {
    rev: true,
  })) as string[];
  const memos = await bulkFetch(ids);
  return memos.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The single most recent published memo. Members only ever see this
 * one slot — older memos are accessible from the admin surface but
 * not surfaced to the widget.
 */
export async function getLatestPublished(): Promise<VoiceMemo | null> {
  // Walk a small window so a recently-unpublished memo doesn't surface
  // as "latest" just because its zset score is high.
  const memos = await listAll(20);
  for (const m of memos) {
    if (m.status === "published" && m.publishedAt) return m;
  }
  return null;
}

export type UpdateMemoPatch = {
  title?: string;
  transcript?: string | null;
  status?: VoiceMemoStatus;
};

export async function updateMemo(
  id: string,
  patch: UpdateMemoPatch
): Promise<VoiceMemo | null> {
  const client = getClient();
  if (!client) return null;
  const existing = await getMemo(id);
  if (!existing) return null;

  const next: VoiceMemo = { ...existing };
  if (typeof patch.title === "string") {
    next.title = sanitizeTitle(patch.title) || existing.title;
  }
  if (patch.transcript === null) {
    next.transcript = null;
  } else if (typeof patch.transcript === "string") {
    const cleaned = sanitizeTranscript(patch.transcript);
    next.transcript = cleaned.length > 0 ? cleaned : null;
  }
  if (patch.status && patch.status !== existing.status) {
    next.status = patch.status;
    // Stamp publishedAt on the transition into published so the
    // member-facing timestamp reflects when it actually went live,
    // not when it was first uploaded as a draft.
    if (patch.status === "published") {
      next.publishedAt = Date.now();
    } else {
      next.publishedAt = null;
    }
  }

  await client.set(`${MEMO_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

/**
 * Remove the metadata record + index entry. Returns the freed memo so
 * the caller can also delete the underlying blob (this lib stays
 * decoupled from Blob storage).
 */
export async function deleteMemo(
  id: string
): Promise<
  | { ok: true; memo: VoiceMemo }
  | { ok: false; error: "not_found" | "storage_unavailable" }
> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };
  const memo = await getMemo(id);
  if (!memo) return { ok: false, error: "not_found" };
  await client.del(`${MEMO_PREFIX}${id}`);
  await client.zrem(INDEX_KEY, id);
  return { ok: true, memo };
}
