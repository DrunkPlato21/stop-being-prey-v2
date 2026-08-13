import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import { giftTermByMonths, type GiftTermMonths } from "./gifts";

// Community Seat Pool — the anonymous sibling of the named gift seat.
// Givers fund seats IN (no recipient); people who can't afford
// membership claim them OUT, privately. Givers and claimers never see
// each other. Empty pool == a FIFO waitlist that auto-grants as seats
// are funded. This module owns the Upstash side: fund + request record
// lifecycles, the two FIFO queues, the aggregate counters, and the two
// atomic match scripts. Stripe session creation lives in ./membership.ts
// (lane "pool"); the webhook drives the funded flip and the match.
//
// Claim is confirm-email-first: a request is created in pending_confirm
// and touches NO counters or queues until the claimer clicks the link
// sent to their address. Only then does it take a seat or join the line.
//
// Redis schema (all under KEY_PREFIX):
//   pool:fund:<id>                  JSON PoolFund (a giver's purchase = one seat)
//   pool:fund:by-session:<sid>      STRING fund id (webhook resolve + success poll)
//   pool:funds:all                  ZSET score=createdAt, member=fund id (admin scan)
//   pool:request:<id>               JSON PoolRequest (a claimer)
//   pool:request:by-token:<token>   STRING request id (confirm link)
//   pool:request:by-email:<email>   STRING request id (light dedup: one active per email)
//   pool:requests:all               ZSET score=createdAt, member=request id (admin scan)
//   pool:available                  LIST (FIFO) of funded, unclaimed fund ids
//   pool:waitlist                   LIST (FIFO) of confirmed request ids with no seat yet
//   pool:count:funded               STRING/int, total seats ever funded
//   pool:count:claimed              STRING/int, total seats ever claimed
//     available = funded - claimed = LLEN pool:available; waiting = LLEN pool:waitlist

// SAFETY: dev sandbox namespace, same reasoning as coins.ts — local dev
// shares ONE production Redis, so without this every seat funded or
// claimed on localhost would mutate the live pool the public counter
// reads. This prefix pushes all pool keys written outside production
// into a separate `dev:` keyspace. Production (NODE_ENV=production on
// Vercel) uses no prefix. POOL_KEY_PREFIX overrides both. Keys off
// NODE_ENV, so test with `npm run dev` — NOT `build && start`.
const KEY_PREFIX =
  process.env.POOL_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

function keysFor(prefix: string) {
  return {
    fund: `${prefix}pool:fund:`,
    fundBySession: `${prefix}pool:fund:by-session:`,
    fundsAll: `${prefix}pool:funds:all`,
    request: `${prefix}pool:request:`,
    requestByToken: `${prefix}pool:request:by-token:`,
    requestByEmail: `${prefix}pool:request:by-email:`,
    requestsAll: `${prefix}pool:requests:all`,
    available: `${prefix}pool:available`,
    waitlist: `${prefix}pool:waitlist`,
    countFunded: `${prefix}pool:count:funded`,
    countClaimed: `${prefix}pool:count:claimed`,
    // Chip-in ("pot") side: many small contributions accumulate here and
    // mint a whole seat each time the balance crosses a seat's price.
    contribution: `${prefix}pool:contribution:`,
    contributionBySession: `${prefix}pool:contribution:by-session:`,
    contributionsAll: `${prefix}pool:contributions:all`,
    pot: `${prefix}pool:pot`, // STRING/int cents toward the next seat
    countContributed: `${prefix}pool:count:contributed`, // lifetime cents in
  };
}

const K = keysFor(KEY_PREFIX);

/** True when pool writes are landing in the production keyspace. */
export function isPoolProduction(): boolean {
  return KEY_PREFIX === "";
}

// Chip-in economics. A pot contribution is an open amount (>= floor,
// <= ceiling) that accumulates until it crosses a seat's price, at which
// point a whole anonymous seat mints into the pool. The fill target is
// the 3-month seat so seats appear often and the progress bar moves;
// derived from the gift terms so the two never drift.
export const POOL_SEAT_FILL_TERM_MONTHS: GiftTermMonths = 3;
export const POOL_SEAT_FILL_PRICE_CENTS =
  giftTermByMonths(POOL_SEAT_FILL_TERM_MONTHS)?.amountCents ?? 3900;
export const POOL_CONTRIBUTION_FLOOR_CENTS = 500; // $5
export const POOL_CONTRIBUTION_CEIL_CENTS = 50000; // $500, fat-finger guard

/* === Types ================================================== */

export type PoolFundStatus = "pending" | "funded" | "claimed";

export type PoolFund = {
  id: string;
  /** Known only after checkout completes (Stripe collects it). */
  buyerEmail: string | null;
  buyerName: string | null;
  /** Optional buyer note. Not shown to the claimer (anonymous both ways);
      kept for the giver's own thank-you context and admin. */
  message: string | null;
  termMonths: GiftTermMonths;
  /** Per-seat price. The Stripe charge is amountCents * seats. */
  amountCents: number;
  /** Seats this payment funds (default 1). When > 1 the record is the
      ORDER; the webhook fans out `seats` child seats (each a single-seat
      fund with parentFundId set) that are individually claimable. */
  seats?: number;
  /** Set on a child seat minted from a multi-seat order. */
  parentFundId?: string | null;
  status: PoolFundStatus;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: number;
  updatedAt: number;
  paidAt: number | null;
  /** The request that took this seat (set once matched + granted). */
  claimedByRequestId: string | null;
  claimedAt: number | null;
};

export type PoolContributionStatus = "pending" | "paid";

/** A chip-in toward the pool: an open-amount payment that lands in the
    pot rather than buying one whole seat. Many of these accumulate and
    mint anonymous seats as the balance crosses a seat's price. */
export type PoolContribution = {
  id: string;
  /** Collected by Stripe at checkout; known after the paid flip. */
  buyerEmail: string | null;
  buyerName: string | null;
  amountCents: number;
  status: PoolContributionStatus;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: number;
  updatedAt: number;
  paidAt: number | null;
  /** Whole seats this contribution's arrival tipped the pot over into
      (0 when it just moved the bar). */
  seatsMinted?: number;
};

export type PoolRequestStatus =
  | "pending_confirm"
  | "waiting"
  | "granted"
  | "expired";

export type PoolRequest = {
  id: string;
  /** Normalized lowercase. The seat is granted to this address. */
  email: string;
  /** Optional one line the claimer left. PRIVATE — admin-only in v1,
      never shown publicly. */
  note: string | null;
  status: PoolRequestStatus;
  /** In the confirm link. Confirm-email-first gates entry to both the
      immediate grant and the waitlist. */
  confirmToken: string;
  /** The funded seat that satisfied this request (set on grant). */
  seatFundId: string | null;
  termMonths: GiftTermMonths | null;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
  grantedAt: number | null;
  /** Membership end (grantedAt + term), for admin display. */
  membershipExpiresAt: number | null;
  /** "Keep your seat" reminder dispatched (the expiry cron sets this
      once). Absent on legacy/un-reminded grants. */
  reminderSentAt?: number | null;
  /** The one nudge sent to someone who asked for a seat and never
      confirmed. Set once, so nobody gets chased twice. */
  confirmNudgeSentAt?: number | null;
  /** When the confirm window last started. The nudge restarts it, so
      the link inside that second email is live rather than a dead
      token the reader has to guess at. Absent on legacy requests,
      which fall back to createdAt and behave exactly as before. */
  confirmTokenIssuedAt?: number | null;
};

/**
 * How long a confirm link stays good; after that the claimer re-submits.
 *
 * Was 72 hours, borrowed from sign-in-link instincts that don't apply
 * here. A sign-in link is short-lived because it opens an account to
 * whoever holds it. This token only lets the owner of one mailbox
 * confirm a request that was made from that same mailbox, and the thing
 * it unlocks is a place in line for a free seat. Nobody is racing to
 * steal that.
 *
 * Meanwhile the cost of the short clock was real and invisible: the
 * people asking are, by definition, the ones with the least slack in
 * their week, and three days is a fast clock for someone sorting out
 * money. Miss it and they drop out silently, still reading
 * pending_confirm forever, while funded seats route past them.
 *
 * Two weeks, which also outlives the nudge window so the second email
 * is never the last thing standing between someone and the room.
 */
export const CONFIRM_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** When this request's confirm link expires. */
export function confirmExpiresAt(request: PoolRequest): number {
  return (request.confirmTokenIssuedAt ?? request.createdAt) + CONFIRM_TTL_MS;
}

/* === Redis client =========================================== */

let cachedClient: Redis | null = null;
function getClient(): Redis | null {
  if (cachedClient) return cachedClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedClient = new Redis({ url, token });
  return cachedClient;
}

export function isPoolStorageConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function parseJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

/* === Funds (give side) ====================================== */

export async function createPoolFund(args: {
  buyerName: string | null;
  message: string | null;
  termMonths: GiftTermMonths;
  amountCents: number;
  /** Seats this payment funds; default 1. */
  seats?: number;
}): Promise<PoolFund | null> {
  const client = getClient();
  if (!client) return null;
  const now = Date.now();
  const record: PoolFund = {
    id: randomUUID(),
    buyerEmail: null,
    buyerName: args.buyerName,
    message: args.message,
    termMonths: args.termMonths,
    amountCents: args.amountCents,
    seats: args.seats && args.seats > 1 ? Math.floor(args.seats) : 1,
    parentFundId: null,
    status: "pending",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    claimedByRequestId: null,
    claimedAt: null,
  };
  await client.set(`${K.fund}${record.id}`, JSON.stringify(record));
  await client.zadd(K.fundsAll, { score: now, member: record.id });
  return record;
}

/**
 * Mint a single, already-funded child seat from a multi-seat order. Each
 * child is an ordinary single-seat fund (so the existing claim/grant path
 * works unchanged) tagged with its parent order. Returns the seat record.
 */
export async function createFundedPoolSeat(args: {
  parentFundId: string;
  termMonths: GiftTermMonths;
  amountCents: number;
  buyerEmail: string | null;
  buyerName: string | null;
  message: string | null;
}): Promise<PoolFund | null> {
  const client = getClient();
  if (!client) return null;
  const now = Date.now();
  const record: PoolFund = {
    id: randomUUID(),
    buyerEmail: args.buyerEmail,
    buyerName: args.buyerName,
    message: args.message,
    termMonths: args.termMonths,
    amountCents: args.amountCents,
    seats: 1,
    parentFundId: args.parentFundId,
    status: "funded",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    createdAt: now,
    updatedAt: now,
    paidAt: now,
    claimedByRequestId: null,
    claimedAt: null,
  };
  await client.set(`${K.fund}${record.id}`, JSON.stringify(record));
  await client.zadd(K.fundsAll, { score: now, member: record.id });
  return record;
}

export async function getPoolFund(id: string): Promise<PoolFund | null> {
  const client = getClient();
  if (!client) return null;
  return parseJson<PoolFund>(await client.get<string>(`${K.fund}${id}`));
}

export async function getPoolFundBySession(
  sessionId: string
): Promise<PoolFund | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(`${K.fundBySession}${sessionId}`);
  if (!id) return null;
  return getPoolFund(typeof id === "string" ? id : String(id));
}

async function updatePoolFund(
  id: string,
  fields: Partial<Omit<PoolFund, "id" | "createdAt">>
): Promise<PoolFund | null> {
  const client = getClient();
  if (!client) return null;
  const existing = await getPoolFund(id);
  if (!existing) return null;
  const next: PoolFund = {
    ...existing,
    ...fields,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await client.set(`${K.fund}${id}`, JSON.stringify(next));
  return next;
}

/** Bind the Stripe session to the fund (post-create, pre-redirect). */
export async function attachPoolCheckout(
  id: string,
  sessionId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${K.fundBySession}${sessionId}`, id);
  await updatePoolFund(id, { stripeSessionId: sessionId });
}

/** Flip a pending fund to funded. Caller then runs placeFundedSeat. */
export async function markPoolFunded(
  id: string,
  args: {
    buyerEmail: string | null;
    buyerName: string | null;
    stripePaymentIntentId: string | null;
  }
): Promise<PoolFund | null> {
  return updatePoolFund(id, {
    status: "funded",
    paidAt: Date.now(),
    buyerEmail: args.buyerEmail ? normEmail(args.buyerEmail) : null,
    buyerName: args.buyerName,
    stripePaymentIntentId: args.stripePaymentIntentId,
  });
}

/** Stamp a seat as taken once its matched request is actually granted. */
export async function markFundClaimed(
  id: string,
  requestId: string
): Promise<PoolFund | null> {
  return updatePoolFund(id, {
    status: "claimed",
    claimedByRequestId: requestId,
    claimedAt: Date.now(),
  });
}

/* === Contributions + pot (chip-in side) ===================== */

export async function createPoolContribution(args: {
  amountCents: number;
}): Promise<PoolContribution | null> {
  const client = getClient();
  if (!client) return null;
  const now = Date.now();
  const record: PoolContribution = {
    id: randomUUID(),
    buyerEmail: null,
    buyerName: null,
    amountCents: Math.floor(args.amountCents),
    status: "pending",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    seatsMinted: 0,
  };
  await client.set(`${K.contribution}${record.id}`, JSON.stringify(record));
  await client.zadd(K.contributionsAll, { score: now, member: record.id });
  return record;
}

export async function getPoolContribution(
  id: string
): Promise<PoolContribution | null> {
  const client = getClient();
  if (!client) return null;
  return parseJson<PoolContribution>(
    await client.get<string>(`${K.contribution}${id}`)
  );
}

export async function getPoolContributionBySession(
  sessionId: string
): Promise<PoolContribution | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(`${K.contributionBySession}${sessionId}`);
  if (!id) return null;
  return getPoolContribution(typeof id === "string" ? id : String(id));
}

async function updatePoolContribution(
  id: string,
  fields: Partial<Omit<PoolContribution, "id" | "createdAt">>
): Promise<PoolContribution | null> {
  const client = getClient();
  if (!client) return null;
  const existing = await getPoolContribution(id);
  if (!existing) return null;
  const next: PoolContribution = {
    ...existing,
    ...fields,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await client.set(`${K.contribution}${id}`, JSON.stringify(next));
  return next;
}

/** Bind the Stripe session to the contribution (post-create, pre-redirect). */
export async function attachContributionCheckout(
  id: string,
  sessionId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(`${K.contributionBySession}${sessionId}`, id);
  await updatePoolContribution(id, { stripeSessionId: sessionId });
}

/** Flip a pending contribution to paid. Idempotency guard for the webhook:
    a second delivery finds it already paid and skips the pot mutation. */
export async function markContributionPaid(
  id: string,
  args: {
    buyerEmail: string | null;
    buyerName: string | null;
    stripePaymentIntentId: string | null;
  }
): Promise<PoolContribution | null> {
  return updatePoolContribution(id, {
    status: "paid",
    paidAt: Date.now(),
    buyerEmail: args.buyerEmail ? normEmail(args.buyerEmail) : null,
    buyerName: args.buyerName,
    stripePaymentIntentId: args.stripePaymentIntentId,
  });
}

export async function setContributionSeatsMinted(
  id: string,
  seatsMinted: number
): Promise<void> {
  await updatePoolContribution(id, { seatsMinted });
}

/**
 * Add a contribution to the pot and report how many whole seats the new
 * balance crosses. Atomic (single EVAL) so two contributions landing at
 * once can't both mint off the same cents or leave the pot in a torn
 * state. Also bumps the lifetime "contributed" counter. The caller mints
 * `minted` seats and drops them into the pool; the pot keeps the change.
 */
export async function addToPot(
  amountCents: number
): Promise<{ minted: number; potCents: number }> {
  const client = getClient();
  if (!client) return { minted: 0, potCents: 0 };
  const script = `
    redis.call('INCRBY', KEYS[2], ARGV[1])
    local pot = redis.call('INCRBY', KEYS[1], ARGV[1])
    local price = tonumber(ARGV[2])
    local minted = 0
    while pot >= price do
      redis.call('DECRBY', KEYS[1], price)
      pot = pot - price
      minted = minted + 1
    end
    return {minted, pot}
  `;
  const res = (await client.eval(
    script,
    [K.pot, K.countContributed],
    [String(Math.floor(amountCents)), String(POOL_SEAT_FILL_PRICE_CENTS)]
  )) as unknown[];
  const minted = Array.isArray(res) ? Number(res[0]) || 0 : 0;
  const potCents = Array.isArray(res) ? Number(res[1]) || 0 : 0;
  return { minted, potCents };
}

/** Current cents sitting in the pot (progress toward the next seat). */
export async function getPoolPot(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  return readInt(client, K.pot);
}

/**
 * Compact signal for the desk's pool-ask band: how many are waiting, the
 * pot balance, and the best available waiter note (the front-of-line
 * waiter who left one, so a blank note never becomes the thing on
 * display). Reads the env's own keyspace like the public counter. Kept
 * light (2 reads, plus one lookup only when someone's waiting) since the
 * desk polls this frequently.
 */
export async function getDeskPoolSignal(): Promise<{
  waiting: number;
  potCents: number;
  note: string | null;
}> {
  const client = getClient();
  if (!client) return { waiting: 0, potCents: 0, note: null };
  const [waitingRaw, potCents] = await Promise.all([
    client.llen(K.waitlist).catch(() => 0),
    readInt(client, K.pot),
  ]);
  const waiting = typeof waitingRaw === "number" ? waitingRaw : 0;
  let note: string | null = null;
  if (waiting > 0) {
    // Front of line first; pick the longest-waiting requester who left a
    // note. Cap the scan so a huge waitlist can't blow up the desk read.
    const raw = (await client
      .lrange(K.waitlist, 0, 11)
      .catch(() => [])) as unknown[];
    const ids = raw.filter((v): v is string => typeof v === "string");
    if (ids.length) {
      const reqs = await getPoolRequestsByIds(ids);
      const noted = reqs.find((r) => r.note && r.note.trim().length > 0);
      note = noted?.note?.trim() ?? null;
    }
  }
  return { waiting, potCents, note };
}

/* === Requests (receive side) ================================ */

export async function createPoolRequest(args: {
  email: string;
  note: string | null;
}): Promise<PoolRequest | null> {
  const client = getClient();
  if (!client) return null;
  const now = Date.now();
  const record: PoolRequest = {
    id: randomUUID(),
    email: normEmail(args.email),
    note: args.note,
    status: "pending_confirm",
    confirmToken: randomUUID(),
    seatFundId: null,
    termMonths: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    grantedAt: null,
    membershipExpiresAt: null,
    reminderSentAt: null,
  };
  await client.set(`${K.request}${record.id}`, JSON.stringify(record));
  await client.set(`${K.requestByToken}${record.confirmToken}`, record.id);
  // One active request per email. Cleared on grant/expire. Light dedup,
  // not policing — just stops one address from hogging waitlist slots.
  await client.set(`${K.requestByEmail}${record.email}`, record.id);
  await client.zadd(K.requestsAll, { score: now, member: record.id });
  return record;
}

export async function getPoolRequest(
  id: string
): Promise<PoolRequest | null> {
  const client = getClient();
  if (!client) return null;
  return parseJson<PoolRequest>(await client.get<string>(`${K.request}${id}`));
}

export async function getPoolRequestByToken(
  token: string
): Promise<PoolRequest | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(`${K.requestByToken}${token}`);
  if (!id) return null;
  return getPoolRequest(typeof id === "string" ? id : String(id));
}

/** The claimer's current active request, if any. Used to block a second
    submission while one is still pending_confirm or waiting. */
export async function getActivePoolRequestByEmail(
  email: string
): Promise<PoolRequest | null> {
  const client = getClient();
  if (!client) return null;
  const id = await client.get<string>(`${K.requestByEmail}${normEmail(email)}`);
  if (!id) return null;
  const req = await getPoolRequest(typeof id === "string" ? id : String(id));
  if (!req) return null;
  return req.status === "pending_confirm" || req.status === "waiting"
    ? req
    : null;
}

async function updatePoolRequest(
  id: string,
  fields: Partial<Omit<PoolRequest, "id" | "createdAt" | "confirmToken">>
): Promise<PoolRequest | null> {
  const client = getClient();
  if (!client) return null;
  const existing = await getPoolRequest(id);
  if (!existing) return null;
  const next: PoolRequest = {
    ...existing,
    ...fields,
    id: existing.id,
    createdAt: existing.createdAt,
    confirmToken: existing.confirmToken,
    updatedAt: Date.now(),
  };
  await client.set(`${K.request}${id}`, JSON.stringify(next));
  return next;
}

/** No seat was available at confirm time: the request is now in line. */
export async function markRequestWaiting(
  id: string
): Promise<PoolRequest | null> {
  const existing = await getPoolRequest(id);
  return updatePoolRequest(id, {
    status: "waiting",
    confirmedAt: existing?.confirmedAt ?? Date.now(),
  });
}

/** A seat satisfied this request. Clears the per-email active index. */
export async function markRequestGranted(
  id: string,
  args: {
    seatFundId: string;
    termMonths: GiftTermMonths;
    membershipExpiresAt: number;
  }
): Promise<PoolRequest | null> {
  const existing = await getPoolRequest(id);
  const next = await updatePoolRequest(id, {
    status: "granted",
    confirmedAt: existing?.confirmedAt ?? Date.now(),
    grantedAt: Date.now(),
    seatFundId: args.seatFundId,
    termMonths: args.termMonths,
    membershipExpiresAt: args.membershipExpiresAt,
  });
  if (next) await clearRequestEmailIndex(next.email);
  return next;
}

export async function markRequestExpired(
  id: string
): Promise<PoolRequest | null> {
  const next = await updatePoolRequest(id, { status: "expired" });
  if (next) await clearRequestEmailIndex(next.email);
  return next;
}

/** Stamp the "keep your seat" reminder so the expiry cron sends it once. */
export async function markRequestReminded(
  id: string
): Promise<PoolRequest | null> {
  return updatePoolRequest(id, { reminderSentAt: Date.now() });
}

/**
 * Record the one confirm nudge AND restart the confirm window.
 *
 * Both halves matter. Someone who has already let the link go cold for
 * a day or two would otherwise get a second email carrying a token that
 * is either dead or about to be, which is a worse experience than
 * silence. Same token, fresh window, so the original email starts
 * working again too.
 */
export async function markRequestConfirmNudged(
  id: string
): Promise<PoolRequest | null> {
  const now = Date.now();
  return updatePoolRequest(id, {
    confirmNudgeSentAt: now,
    confirmTokenIssuedAt: now,
  });
}

/** Requests still sitting at pending_confirm, oldest ask first. */
export async function listUnconfirmedRequests(): Promise<PoolRequest[]> {
  const ids = await listAllPoolRequestIds();
  const out: PoolRequest[] = [];
  for (const id of ids) {
    const req = await getPoolRequest(id).catch(() => null);
    if (req && req.status === "pending_confirm") out.push(req);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

/** Every pool request id, for the daily expiry-reminder cron scan.
    Reads the env's own keyspace (prod in production). */
export async function listAllPoolRequestIds(): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const raw = await client
    .zrange(K.requestsAll, 0, -1)
    .catch(() => [] as unknown[]);
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
}

async function clearRequestEmailIndex(email: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.del(`${K.requestByEmail}${normEmail(email)}`);
}

/* === Atomic match scripts ===================================
   The pool's two race-sensitive moments. Same single-round-trip EVAL
   pattern as the founder/charter slot claim in members.ts, so a claim
   and a funding firing at the same instant can never both walk away
   with the same seat or both leave a waiter behind. */

type ClaimOutcome =
  | { kind: "granted"; fundId: string }
  | { kind: "waitlisted" };

/**
 * At confirm time: take the front available seat if there is one
 * (incrementing claimed), otherwise push this request onto the back of
 * the waitlist. Atomic so a concurrent funding can't slip a seat past us
 * into the void between "no seat" and "joined the line".
 */
export async function claimSeatOrWaitlist(
  requestId: string
): Promise<ClaimOutcome> {
  const client = getClient();
  if (!client) return { kind: "waitlisted" };
  const script = `
    local seat = redis.call('LPOP', KEYS[1])
    if seat then
      redis.call('INCR', KEYS[3])
      return {'granted', seat}
    else
      redis.call('RPUSH', KEYS[2], ARGV[1])
      return {'waitlisted'}
    end
  `;
  const res = (await client.eval(
    script,
    [K.available, K.waitlist, K.countClaimed],
    [requestId]
  )) as unknown[];
  if (Array.isArray(res) && res[0] === "granted") {
    return { kind: "granted", fundId: String(res[1]) };
  }
  return { kind: "waitlisted" };
}

type FundOutcome =
  | { kind: "matched"; requestId: string }
  | { kind: "queued" };

/**
 * At funding time: increment funded, then hand the new seat to the
 * front waiter if the line isn't empty (incrementing claimed), otherwise
 * park the seat in the available queue. Atomic against a concurrent
 * claim.
 */
export async function placeFundedSeat(fundId: string): Promise<FundOutcome> {
  const client = getClient();
  if (!client) return { kind: "queued" };
  const script = `
    redis.call('INCR', KEYS[3])
    local waiter = redis.call('LPOP', KEYS[2])
    if waiter then
      redis.call('INCR', KEYS[4])
      return {'matched', waiter}
    else
      redis.call('RPUSH', KEYS[1], ARGV[1])
      return {'queued'}
    end
  `;
  const res = (await client.eval(
    script,
    [K.available, K.waitlist, K.countFunded, K.countClaimed],
    [fundId]
  )) as unknown[];
  if (Array.isArray(res) && res[0] === "matched") {
    return { kind: "matched", requestId: String(res[1]) };
  }
  return { kind: "queued" };
}

/**
 * Undo a match when the popped waiter turned out ineligible (e.g. they
 * became a paying member between confirming and the seat funding):
 * decrement claimed and return the seat to the available queue.
 */
export async function releaseFundedSeat(fundId: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const script = `
    redis.call('DECR', KEYS[2])
    redis.call('RPUSH', KEYS[1], ARGV[1])
    return 1
  `;
  await client.eval(script, [K.available, K.countClaimed], [fundId]);
}

/* === Aggregates + polling =================================== */

export type PoolStats = {
  funded: number;
  claimed: number;
  available: number;
  waiting: number;
  /** Cents accumulated in the chip-in pot toward the next seat. */
  potCents: number;
};

async function readInt(client: Redis, key: string): Promise<number> {
  const raw = await client.get<string | number | null>(key).catch(() => null);
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aggregate pool counts for the public counter and the admin page.
 * `opts.prod` reads the unprefixed production keys — the admin page runs
 * on localhost (dev keyspace) but wants to show the real live pool,
 * mirroring getArticleCounts(slugs, dev=false) in analytics.ts.
 */
export async function getPoolStats(opts?: { prod?: boolean }): Promise<PoolStats> {
  const empty: PoolStats = {
    funded: 0,
    claimed: 0,
    available: 0,
    waiting: 0,
    potCents: 0,
  };
  const client = getClient();
  if (!client) return empty;
  const k = opts?.prod ? keysFor("") : K;
  const [funded, claimed, available, waiting, potCents] = await Promise.all([
    readInt(client, k.countFunded),
    readInt(client, k.countClaimed),
    client.llen(k.available).catch(() => 0),
    client.llen(k.waitlist).catch(() => 0),
    readInt(client, k.pot),
  ]);
  return {
    funded,
    claimed,
    available: typeof available === "number" ? available : 0,
    waiting: typeof waiting === "number" ? waiting : 0,
    potCents,
  };
}

/**
 * Wait briefly for the webhook to flip this session's fund to funded.
 * Used by the success page after the Stripe redirect (same pattern as
 * pollGiftBySession).
 */
export async function pollPoolFundBySession(
  sessionId: string,
  attempts = 6,
  delayMs = 200
): Promise<PoolFund | null> {
  for (let i = 0; i < attempts; i++) {
    const fund = await getPoolFundBySession(sessionId);
    if (fund && fund.status !== "pending") return fund;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return getPoolFundBySession(sessionId);
}

/* === Admin reads ============================================ */

/** Request ids currently in the waitlist, front of line first. */
export async function listWaitlistRequestIds(
  opts?: { prod?: boolean }
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const k = opts?.prod ? keysFor("") : K;
  const raw = (await client
    .lrange(k.waitlist, 0, -1)
    .catch(() => [])) as unknown[];
  return raw.filter((v): v is string => typeof v === "string");
}

/** Most recent request ids (admin situational awareness + private notes). */
export async function listRecentRequestIds(
  limit = 50,
  opts?: { prod?: boolean }
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  const k = opts?.prod ? keysFor("") : K;
  const raw = await client
    .zrange(k.requestsAll, 0, limit - 1, { rev: true })
    .catch(() => [] as unknown[]);
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
}

/** Load request records by id, in the order given (admin tables). */
export async function getPoolRequestsByIds(
  ids: string[],
  opts?: { prod?: boolean }
): Promise<PoolRequest[]> {
  if (ids.length === 0) return [];
  const client = getClient();
  if (!client) return [];
  const k = opts?.prod ? keysFor("") : K;
  const keys = ids.map((id) => `${k.request}${id}`);
  const raw = (await client
    .mget<(string | null)[]>(...keys)
    .catch(() => [] as (string | null)[])) ?? [];
  const out: PoolRequest[] = [];
  raw.forEach((r) => {
    const parsed = parseJson<PoolRequest>(r ?? null);
    if (parsed) out.push(parsed);
  });
  return out;
}
