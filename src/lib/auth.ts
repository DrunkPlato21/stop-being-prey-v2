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

// The session cookie's max-age, kept in lockstep with the JWT's own expiry
// (signSession) so the cookie and the token it carries die together.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * SESSION_DURATION_DAYS;

// Rolling refresh: a still-valid session older than this is re-signed with
// a fresh 30-day window on the next page view (see maybeRefreshSession + the
// proxy). One day means an active member is re-upped at most once a day and
// effectively never gets logged out mid-use, while an idle session still
// expires 30 days after its last visit.
const SESSION_REFRESH_AFTER_SECONDS = 60 * 60 * 24;

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

// The session cookie's flags live here alone so the sign-in callback and
// the rolling-refresh proxy always write a byte-identical cookie.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

// Client-readable companion to the httpOnly session: "m" (member session
// exists) or "a" (confirmed anonymous). The chrome loader reads it to
// decide between the per-viewer /api/chrome and the CDN-cached
// /api/presence, so anonymous browsers stop paying a function invocation
// per page view. Deliberately NOT httpOnly — its whole job is being
// readable from document.cookie — and it carries no identity, only which
// of two endpoints to ask. Absent means "unknown, ask /api/chrome once";
// that call answers with the marker, so pre-existing member sessions
// migrate on their first page view.
export const WHO_COOKIE = "sbp_who";

export function whoCookieOptions() {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Rolling-session refresh. Given the current session cookie value, returns
 * a freshly signed token when the existing one is still valid but older than
 * SESSION_REFRESH_AFTER_SECONDS, so the 30-day window slides forward on an
 * active member and they never get logged out mid-use. Returns null when the
 * token is missing, invalid/expired, or still fresh enough that re-issuing
 * would just churn the cookie. Never throws; the caller sets the cookie only
 * when a new token comes back.
 */
export async function maybeRefreshSession(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (
      typeof payload.email !== "string" ||
      typeof payload.customerId !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
    if (ageSeconds < SESSION_REFRESH_AFTER_SECONDS) return null;
    return await signSession({
      email: payload.email,
      customerId: payload.customerId,
    });
  } catch {
    return null;
  }
}

// Billing-recovery tokens live longer than a magic link (Stripe's dunning
// retries span multiple days) and grant NO site access — only a Stripe
// customer-portal session for one customer. See signBillingToken below.
const BILLING_TOKEN_TTL_DAYS = 30;

/**
 * Sign a stateless billing-recovery token. Unlike a session, it grants no
 * access to the site — it only lets the holder open the Stripe customer
 * portal for this one customer (to fix a failed payment) via the public
 * /billing/fix route. Reusable until expiry so a member can click the same
 * email link across Stripe's multi-day retry window, and self-contained
 * (no Redis) so it can't be locked out by a storage blip. Carries a
 * distinct `purpose` so it can never be mistaken for a session JWT.
 */
export async function signBillingToken(customerId: string): Promise<string> {
  return new SignJWT({ purpose: "billing-recovery", customerId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${BILLING_TOKEN_TTL_DAYS}d`)
    .sign(authSecret());
}

/**
 * Verify a billing-recovery token. Returns the customerId on success,
 * null on failure (bad signature, expired, or wrong purpose).
 */
export async function verifyBillingToken(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (
      payload.purpose === "billing-recovery" &&
      typeof payload.customerId === "string"
    ) {
      return payload.customerId;
    }
    return null;
  } catch {
    return null;
  }
}

// Digest-unsubscribe tokens follow the billing-token pattern: stateless,
// long-lived, single-purpose, no site access. They live in every weekly
// digest footer, so the TTL is a year — a member acting on a six-month-old
// email should still get a working one-click out.
const DIGEST_TOKEN_TTL_DAYS = 365;

/**
 * Sign a digest-unsubscribe token. Grants nothing but the ability to
 * flip this one email's weekly-digest preference via the public
 * /digest/unsubscribe route — no login, per the house email rule.
 */
export async function signDigestToken(email: string): Promise<string> {
  return new SignJWT({ purpose: "digest-unsub", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIGEST_TOKEN_TTL_DAYS}d`)
    .sign(authSecret());
}

/**
 * Verify a digest-unsubscribe token. Returns the email on success,
 * null on failure (bad signature, expired, or wrong purpose).
 */
export async function verifyDigestToken(
  token: string | undefined | null
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (
      payload.purpose === "digest-unsub" &&
      typeof payload.email === "string"
    ) {
      return payload.email;
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
 * Mint a single-use magic-link token. Stored in Redis with a one-shot
 * delete on consume. Defaults to a 24-hour TTL (the automated sign-in
 * email); callers can pass a longer TTL for links handed out by hand
 * (e.g. the admin "mint sign-in link" tool, 7 days).
 */
export async function createMagicLink(
  record: MagicLinkRecord,
  ttlSeconds: number = MAGIC_LINK_TTL_SECONDS
): Promise<string | null> {
  const client = redis();
  if (!client) return null;
  const id = randomUUID();
  await client.set(`${MAGIC_PREFIX}${id}`, JSON.stringify(record), {
    ex: ttlSeconds,
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
