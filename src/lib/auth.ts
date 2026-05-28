import { SignJWT, jwtVerify } from "jose";
import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Magic-link JWT auth, no NextAuth. Single-use 24-hour tokens stored in
// Upstash Redis (already configured for supporters). Session is a 30-day
// JWT in an httpOnly cookie. AUTH_SECRET signs both.

const SESSION_DURATION_DAYS = 30;
const MAGIC_LINK_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const SESSION_COOKIE_NAME = "sbp_session";
const MAGIC_PREFIX = "magic:";

export const SESSION_COOKIE = SESSION_COOKIE_NAME;

let cachedRedis: Redis | null = null;
function redis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -base64 32`."
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  email: string;
  customerId: string;
};

/**
 * Sign a session JWT for a known member. The payload travels in the
 * cookie itself, so the gating middleware can verify without a DB
 * lookup. Expiry is 30 days; the user re-requests a magic link after.
 */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(authSecret());
}

/**
 * Verify a session JWT. Returns the decoded payload on success, null on
 * failure (including expired). Callable from edge middleware.
 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (
      typeof payload.email === "string" &&
      typeof payload.customerId === "string"
    ) {
      return { email: payload.email, customerId: payload.customerId };
    }
    return null;
  } catch {
    return null;
  }
}

export type MagicLinkRecord = {
  email: string;
  customerId: string;
  next: string;
};

/**
 * Mint a single-use magic-link token. Stored in Redis with a 24-hour
 * TTL and a one-shot delete on consume.
 */
export async function createMagicLink(
  record: MagicLinkRecord
): Promise<string | null> {
  const client = redis();
  if (!client) return null;
  const id = randomUUID();
  await client.set(`${MAGIC_PREFIX}${id}`, JSON.stringify(record), {
    ex: MAGIC_LINK_TTL_SECONDS,
  });
  return id;
}

/**
 * Consume a magic-link token. Returns the stored record on first use,
 * null if missing, expired, or already consumed.
 */
export async function consumeMagicLink(
  id: string
): Promise<MagicLinkRecord | null> {
  const client = redis();
  if (!client) return null;
  const key = `${MAGIC_PREFIX}${id}`;
  const raw = await client.get<string>(key);
  if (!raw) return null;
  await client.del(key);
  try {
    const parsed = typeof raw === "string"
      ? (JSON.parse(raw) as MagicLinkRecord)
      : (raw as MagicLinkRecord);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Sanity-check a redirect target so a malicious magic link can't bounce
 * the user off-site. Only same-origin paths starting with a single slash
 * (and not "//") are allowed.
 */
export function safeNextPath(input: string | null | undefined): string {
  const fallback = "/desk";
  if (!input) return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//")) return fallback;
  return input;
}
