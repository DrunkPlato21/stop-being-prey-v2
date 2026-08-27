import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Pay-it-forward gift memberships. A buyer (member or not) pays once
// for a fixed term of membership for someone else. This module owns
// the Upstash side: the gift record lifecycle and its lookup indexes.
// Stripe-side session creation lives in ./membership.ts with the other
// checkout lanes; the webhook (lane "gift") drives the paid flip.
//
// Lifecycle: pending (checkout created) -> paid (webhook, redemption
// email sent) -> redeemed (recipient claimed the seat). blocked_self is
// the dead-end for a buyer who gifted their own email (auto-refunded).
//
// Redis schema:
//   gift:<id>                    JSON GiftRecord (primary)
//   gift:by-session:<sessionId>  STRING gift id (webhook lookup + idempotency)
//   gift:by-token:<token>        STRING gift id (redemption link)
//   gift:by-recipient:<email>    STRING gift id (latest redeemed gift; conversion stamp)
//   gifts:all                    ZSET, score=createdAt, member=gift id (cron scan + admin)

const GIFT_PREFIX = "gift:";
const GIFT_BY_SESSION_PREFIX = "gift:by-session:";
const GIFT_BY_TOKEN_PREFIX = "gift:by-token:";
const GIFT_BY_RECIPIENT_PREFIX = "gift:by-recipient:";
const GIFTS_ALL_INDEX = "gifts:all";

export type GiftTermMonths = 3 | 12;

export type GiftStatus = "pending" | "paid" | "redeemed" | "blocked_self";

export type GiftRecord = {
  id: string;
  /** Normalized lowercase. The seat is keyed to this address, not to
      whoever clicks the redemption link. */
  recipientEmail: string;
  /** Known only after checkout completes (Stripe collects it). */
  buyerEmail: string | null;
  /** Buyer-entered display name for the gift email; falls back to the
      Stripe cardholder name, then a generic label. */
  buyerName: string | null;
  message: string | null;
  termMonths: GiftTermMonths;
  amountCents: number;
  status: GiftStatus;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  /** Single random token in the redemption link. Minted on the paid
      flip, never before money has landed. */
  redemptionToken: string | null;
  createdAt: number;
  updatedAt: number;
  paidAt: number | null;
  redeemedAt: number | null;
  /** Membership end, set at redemption (redeemedAt + term). */
  expiresAt: number | null;
  /** "Keep your seat" reminder dispatched (cron sets this once). */
  reminderSentAt: number | null;
  /** The invitation was re-sent because the seat was still unclaimed
      (cron sets this once). Separate from reminderSentAt: that one
      guards the END of a redeemed term, this one guards the front
      door, and a gift that is nudged into being claimed will later
      want the expiry reminder too. */
  claimNudgedAt?: number | null;
  /** Recipient bought their own membership (webhook stamps this). */
  convertedAt: number | null;
  /** Buyer was told the recipient already had a seat (sent once). */
  buyerNotifiedAlreadyMemberAt: number | null;
};

/* === Pricing ================================================
   Fixed one-time prices: 3x and 10x the $13 regular monthly floor.
   The yearly gift matches the yearly membership floor so a gift is
   never a discount path around the subscription. */

export const GIFT_TERMS: ReadonlyArray<{
  months: GiftTermMonths;
  amountCents: number;
  label: string;
}> = [
  { months: 3, amountCents: 3900, label: "3 months" },
  { months: 12, amountCents: 13000, label: "1 year" },
];

export function giftTermByMonths(
  months: number
): { months: GiftTermMonths; amountCents: number; label: string } | null {
  return GIFT_TERMS.find((t) => t.months === months) ?? null;
}

/** Calendar-month addition so a 3-month gift redeemed Jan 31 lands at
    the end of April, not 90 flat days later. */
export function addMonths(fromMs: number, months: number): number {
  const d = new Date(fromMs);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** Days before expiry to send the "keep your seat" reminder. Shorter
    terms get a tighter window so the nudge doesn't land mid-term. */
export function reminderWindowDays(termMonths: GiftTermMonths): number {
  return termMonths === 3 ? 7 : 14;
}

/** Days a paid gift may sit unclaimed before the invitation is sent a
    second time. One week: long enough that the nudge is not nagging
    someone who simply has not opened their mail yet, short enough that
    a buyer's money is not idle for a month while the seat it bought
    goes unused. */
export const UNCLAIMED_NUDGE_DAYS = 7;

/* === Redis client ========================================== */

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isGiftStorageConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function parseGift(raw: unknown): GiftRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as GiftRecord)
      : (raw as GiftRecord);
  } catch {
    return null;
  }
}

/* === CRUD =================================================== */

/**
 * Create a pending gift before the Stripe redirect. The session id is
 * bound afterwards via attachGiftCheckout (mirrors the case-review and
 * paid-comment draft-then-bind pattern).
 */
export async function createGift(args: {
  recipientEmail: string;
  buyerName: string | null;
  message: string | null;
  termMonths: GiftTermMonths;
  amountCents: number;
}): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const now = Date.now();
  const record: GiftRecord = {
    id: randomUUID(),
    recipientEmail: normEmail(args.recipientEmail),
    buyerEmail: null,
    buyerName: args.buyerName,
    message: args.message,
    termMonths: args.termMonths,
    amountCents: args.amountCents,
    status: "pending",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    redemptionToken: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    redeemedAt: null,
    expiresAt: null,
    reminderSentAt: null,
    convertedAt: null,
    buyerNotifiedAlreadyMemberAt: null,
  };
  await client.set(`${GIFT_PREFIX}${record.id}`, JSON.stringify(record));
  await client.zadd(GIFTS_ALL_INDEX, { score: now, member: record.id });
  return record;
}

export async function getGift(id: string): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${GIFT_PREFIX}${id}`);
  return parseGift(raw);
}

export async function getGiftBySessionId(
  sessionId: string
): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(
    `${GIFT_BY_SESSION_PREFIX}${sessionId}`
  );
  if (!id) return null;
  return getGift(typeof id === "string" ? id : String(id));
}

export async function getGiftByToken(
  token: string
): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(`${GIFT_BY_TOKEN_PREFIX}${token}`);
  if (!id) return null;
  return getGift(typeof id === "string" ? id : String(id));
}

/** Latest redeemed gift for an email (conversion-stamp lookup). */
export async function getGiftByRecipient(
  email: string
): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(
    `${GIFT_BY_RECIPIENT_PREFIX}${normEmail(email)}`
  );
  if (!id) return null;
  return getGift(typeof id === "string" ? id : String(id));
}

/** Persist field updates onto an existing gift. Indexes are NOT touched
    here; the lifecycle helpers below own those writes. */
export async function updateGift(
  id: string,
  fields: Partial<Omit<GiftRecord, "id" | "createdAt">>
): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const existing = await getGift(id);
  if (!existing) return null;
  const next: GiftRecord = {
    ...existing,
    ...fields,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await client.set(`${GIFT_PREFIX}${id}`, JSON.stringify(next));
  return next;
}

/** Bind the Stripe session to the gift (post-create, pre-redirect). */
export async function attachGiftCheckout(
  id: string,
  sessionId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${GIFT_BY_SESSION_PREFIX}${sessionId}`, id);
  await updateGift(id, { stripeSessionId: sessionId });
}

/**
 * Flip a pending gift to paid: stamp buyer details, mint the redemption
 * token, write the token index. Caller (webhook) sends the gift email.
 */
export async function markGiftPaid(
  id: string,
  args: {
    buyerEmail: string | null;
    buyerName: string | null;
    stripePaymentIntentId: string | null;
  }
): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const token = randomUUID();
  const next = await updateGift(id, {
    status: "paid",
    paidAt: Date.now(),
    buyerEmail: args.buyerEmail ? normEmail(args.buyerEmail) : null,
    buyerName: args.buyerName,
    stripePaymentIntentId: args.stripePaymentIntentId,
    redemptionToken: token,
  });
  if (!next) return null;
  await client.set(`${GIFT_BY_TOKEN_PREFIX}${token}`, id);
  return next;
}

/**
 * Flip a paid gift to redeemed and index it by recipient so the
 * membership webhook can stamp a later self-paid conversion.
 */
export async function markGiftRedeemed(
  id: string,
  expiresAt: number
): Promise<GiftRecord | null> {
  const client = getClient();
  if (!client) return null;
  const next = await updateGift(id, {
    status: "redeemed",
    redeemedAt: Date.now(),
    expiresAt,
  });
  if (!next) return null;
  await client.set(
    `${GIFT_BY_RECIPIENT_PREFIX}${next.recipientEmail}`,
    id
  );
  return next;
}

/**
 * Re-point an unredeemed paid gift at a new recipient ("pass it on"
 * when the original recipient already holds a seat). Token stays the
 * same; the gift email is re-sent by the caller.
 */
export async function forwardGift(
  id: string,
  newRecipientEmail: string
): Promise<GiftRecord | null> {
  return updateGift(id, {
    recipientEmail: normEmail(newRecipientEmail),
    buyerNotifiedAlreadyMemberAt: null,
  });
}

/** Every gift id, oldest first. Cron-scan scale is fine for v1. */
export async function listAllGiftIds(): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const raw = await client
    .zrange(GIFTS_ALL_INDEX, 0, -1)
    .catch(() => [] as unknown[]);
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Wait briefly for the webhook to flip this session's gift to paid.
 * Used by /membership/gift/success after the Stripe redirect, same
 * pattern as pollMemberBySession.
 */
export async function pollGiftBySession(
  sessionId: string,
  attempts = 6,
  delayMs = 200
): Promise<GiftRecord | null> {
  for (let i = 0; i < attempts; i++) {
    const gift = await getGiftBySessionId(sessionId);
    if (gift && gift.status !== "pending") return gift;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return getGiftBySessionId(sessionId);
}
