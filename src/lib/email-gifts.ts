import { randomBytes } from "crypto";
import {
  getArchiveRedis,
  keyspacePrefix,
  type ReadKeyspace,
} from "@/lib/email-reads";

// Gift links for the patron email archive. A patron can share one email
// with anyone: the link carries an unguessable token, and that token
// opens that one email, nothing else, with no sign-in. It's how the
// archive recruits: the bottom of a gifted email invites the reader onto
// the free daily list.
//
// Keys (same dev:/live split as lib/email-reads.ts):
//   emails:gift:<token>               JSON { kitId, by, createdAt }
//   emails:gift:by:<email>            HASH kitId -> token. Re-sharing the
//                                     same email hands back the same link
//                                     and doesn't spend another.
//   emails:gift:month:<email>:<yyyy-mm>  links made this calendar month
//                                     (Eastern), for the cap.
//   emails:gift:count                 HASH kitId -> links made, for the
//                                     admin view. Totals only.
//
// Gift links don't expire. A text sent today should still open next year.

export const GIFTS_PER_MONTH = 5;

const KEY_PREFIX =
  process.env.EMAIL_ARCHIVE_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

const norm = (email: string) => email.toLowerCase().trim();
const tokenKey = (token: string) => `${KEY_PREFIX}emails:gift:${token}`;
const byKey = (email: string) => `${KEY_PREFIX}emails:gift:by:${norm(email)}`;
const countKey = (prefix = KEY_PREFIX) => `${prefix}emails:gift:count`;

function monthStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/New_York",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}
const monthKey = (email: string) =>
  `${KEY_PREFIX}emails:gift:month:${norm(email)}:${monthStamp()}`;
// Comfortably past the end of any month; the key is only ever read for
// the month it names.
const MONTH_TTL_SECONDS = 60 * 60 * 24 * 40;

type GiftRecord = { kitId: number; by: string; createdAt: number };

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** The email a gift token opens, or null for an unknown/malformed one. */
export async function resolveGift(token: string): Promise<number | null> {
  if (!TOKEN_RE.test(token)) return null;
  const client = getArchiveRedis();
  if (!client) return null;
  try {
    const rec = await client.get<GiftRecord>(tokenKey(token));
    return rec && typeof rec.kitId === "number" ? rec.kitId : null;
  } catch {
    return null;
  }
}

export type GiftState = {
  /** This patron's existing link token for the email, if any. */
  token: string | null;
  /** New links they can still make this month. */
  remaining: number;
};

export async function getGiftState(
  email: string,
  kitId: number
): Promise<GiftState> {
  const client = getArchiveRedis();
  if (!client) return { token: null, remaining: 0 };
  try {
    const [token, used] = await Promise.all([
      client.hget<string>(byKey(email), String(kitId)),
      client.get<number>(monthKey(email)),
    ]);
    return {
      token: token ?? null,
      remaining: Math.max(0, GIFTS_PER_MONTH - Number(used ?? 0)),
    };
  } catch {
    return { token: null, remaining: 0 };
  }
}

export type CreateGiftResult =
  | { ok: true; token: string; reused: boolean; remaining: number }
  | { ok: false; error: "limit" | "unavailable"; remaining: number };

/**
 * The patron's gift link for this email: their existing one if they've
 * shared it before (free), else a new one if they're under the month's
 * cap. The cap is claimed with INCR before the link is written, so two
 * taps at once can't both slip under it.
 */
export async function createGift(
  email: string,
  kitId: number
): Promise<CreateGiftResult> {
  const client = getArchiveRedis();
  if (!client) return { ok: false, error: "unavailable", remaining: 0 };
  try {
    const existing = await client.hget<string>(byKey(email), String(kitId));
    const usedNow = Number((await client.get<number>(monthKey(email))) ?? 0);
    if (existing) {
      return {
        ok: true,
        token: existing,
        reused: true,
        remaining: Math.max(0, GIFTS_PER_MONTH - usedNow),
      };
    }

    const used = await client.incr(monthKey(email));
    if (used === 1) await client.expire(monthKey(email), MONTH_TTL_SECONDS);
    if (used > GIFTS_PER_MONTH) {
      await client.decr(monthKey(email));
      return { ok: false, error: "limit", remaining: 0 };
    }

    const token = randomBytes(16).toString("base64url");
    const record: GiftRecord = { kitId, by: norm(email), createdAt: Date.now() };
    await client.set(tokenKey(token), record);
    // HSETNX: if a second tap raced past the existing-link check, the
    // first link stays the patron's link for this email.
    const fresh = await client.hsetnx(byKey(email), String(kitId), token);
    if (!fresh) {
      await Promise.all([
        client.del(tokenKey(token)),
        client.decr(monthKey(email)),
      ]);
      const winner = await client.hget<string>(byKey(email), String(kitId));
      return {
        ok: true,
        token: winner!,
        reused: true,
        remaining: Math.max(0, GIFTS_PER_MONTH - (used - 1)),
      };
    }
    await client.hincrby(countKey(), String(kitId), 1);
    return {
      ok: true,
      token,
      reused: false,
      remaining: Math.max(0, GIFTS_PER_MONTH - used),
    };
  } catch {
    return { ok: false, error: "unavailable", remaining: 0 };
  }
}

/** Gift links made per email (admin view; totals only). */
export async function getGiftCounts(
  keyspace: ReadKeyspace
): Promise<Map<number, number>> {
  const client = getArchiveRedis();
  const counts = new Map<number, number>();
  if (!client) return counts;
  try {
    const all = await client.hgetall<Record<string, number | string>>(
      countKey(keyspacePrefix(keyspace))
    );
    for (const [id, n] of Object.entries(all ?? {})) {
      counts.set(Number(id), Number(n));
    }
  } catch {
    // An empty column beats a broken admin page.
  }
  return counts;
}
