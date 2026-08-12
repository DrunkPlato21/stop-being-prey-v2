import { Redis } from "@upstash/redis";

// Member records + founder counter. The membership lib (./membership.ts)
// owns Stripe-side helpers; this module owns the Upstash side: who's a
// member, what tier they got, and the atomic founder-slot counter.
//
// Redis schema:
//   founder:claimed                  STRING/integer, INCR'd atomically via EVAL
//   charter:claimed                  STRING/integer, INCR'd atomically via EVAL
//   member:<email>                   JSON MemberRecord (primary)
//   member:by-customer:<customerId>  STRING email (Stripe lifecycle webhook lookup)
//   member:by-session:<sessionId>    STRING email (idempotency dedupe for checkout.session.completed retries)
//   members:all                      ZSET, score=createdAt, member=email (fan-out broadcast index)

// SAFETY: dev sandbox namespace, same reasoning as coins.ts / pool.ts.
// Local dev shares ONE production Redis, so without this, granting a
// seat or creating a member while testing on localhost writes a real
// member:<email> the live site reads. This prefix pushes member writes
// made outside production into a separate `dev:` keyspace the live site
// never reads. Production (NODE_ENV=production on Vercel) uses no prefix.
// MEMBERS_KEY_PREFIX overrides both — set it to "" to read/write the
// live keyspace from a local box on purpose. Keys off NODE_ENV, so
// sandboxing applies under `npm run dev`, NOT `build && start`.
//
// Exported so the few consumers that scan member keys directly
// (lib/activity.ts, the admin backfill route) stay in the same keyspace.
const KEY_PREFIX =
  process.env.MEMBERS_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

const FOUNDER_KEY = `${KEY_PREFIX}founder:claimed`;
export const FOUNDER_CAP = 100;
const CHARTER_KEY = `${KEY_PREFIX}charter:claimed`;
export const CHARTER_CAP = 100;

export const MEMBER_PREFIX = `${KEY_PREFIX}member:`;
export const MEMBER_BY_CUSTOMER_PREFIX = `${KEY_PREFIX}member:by-customer:`;
export const MEMBER_BY_SESSION_PREFIX = `${KEY_PREFIX}member:by-session:`;
export const MEMBERS_ALL_INDEX = `${KEY_PREFIX}members:all`;

/** True when member writes are landing in the production keyspace. */
export function isMembersProduction(): boolean {
  return KEY_PREFIX === "";
}

export type Tier = "founder" | "charter" | "regular";

export type MemberSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "unpaid";

export type MemberRecord = {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: Tier;
  founderSlot: number | null;
  /** Charter slot number 1..100, set on the webhook for members who
      signed up during the Charter window (after founder cap filled,
      before charter cap fills). Backward compatible: legacy records
      without this field read as null and render no charter chip. */
  charterSlot: number | null;
  status: MemberSubscriptionStatus;
  interval: "month" | "year";
  amountCents: number;
  createdAt: number;
  updatedAt: number;
  customAvatarUrl: string | null;
  /** Prepaid gift-seat end. Set when the member's access came from a
      redeemed gift rather than a Stripe subscription; access checks
      treat the record as active until this passes. Cleared (absent)
      on records created by a real subscription, including when a
      gifted member converts. Backward compatible: legacy records
      read as undefined. */
  giftExpiresAt?: number | null;
  /** The gift that granted this seat (see lib/gifts.ts). */
  viaGiftId?: string | null;
  /** The community-pool seat that granted this membership (see
      lib/pool.ts). Mutually exclusive with viaGiftId in practice: both
      mint a prepaid seat via grantPrepaidSeat, only one source set.
      Backward compatible: legacy records read as undefined. */
  viaPoolFundId?: string | null;
  /** When the subscription was first canceled (status -> "canceled").
      Stamped once on cancel, cleared if the member reactivates. Powers
      churn reporting (when, not just how many). Backward compatible:
      legacy + active records read as undefined/null. */
  canceledAt?: number | null;
  /** What Stripe actually said the last time a renewal failed. Set on
      invoice.payment_failed, cleared the moment a payment clears.
      Backward compatible: legacy records read as undefined. */
  billingFailure?: BillingFailure | null;
};

/**
 * The facts behind a `past_due` record, kept so the member area can
 * state what happened instead of guessing.
 *
 * We used to store the status flip and nothing else, which left every
 * member-facing surface assuming the one story we could tell without
 * data: your card expired, replace it. That is wrong often enough to
 * matter. A card declined for insufficient funds is a different
 * situation than a reissued card, and telling someone to replace a card
 * that is working fine reads as a system that isn't paying attention.
 *
 * Every field is nullable because Stripe doesn't guarantee any of it —
 * the copy has to degrade to something true when a value is missing.
 */
export type BillingFailure = {
  /** Stripe's network decline code ("insufficient_funds") when there is
      one, else the PaymentIntent error code ("card_declined"). */
  declineCode: string | null;
  /** The card that failed, for "the Visa ending 1644". */
  cardBrand: string | null;
  cardLast4: string | null;
  /** ms epoch of the most recent failed attempt. */
  failedAt: number;
  /** ms epoch of Stripe's next automatic retry. Null means the retry
      window is spent and the seat closes on this invoice. */
  nextAttemptAt: number | null;
  /** Stripe's own attempt counter for the invoice. */
  attemptCount: number;
  /** What the failed renewal was for, in cents. */
  amountCents: number | null;
};

/**
 * The single definition of "this record entitles a live seat". The site
 * chrome, the paid-viewer helper, and the sign-in gate all read this, so
 * they can't drift into disagreeing about who is signed in — a viewer the
 * header treats as logged-out must not be treated as logged-in by the
 * sign-in page, or the two deadlock with no way out.
 *
 * Deliberately narrower than "has a record": past_due, canceled, unpaid
 * and friends all read false. Those members can still hold a valid
 * session (see SIGN_IN_STATUSES in api/auth/request-link) — holding a
 * session and holding a seat are different questions.
 */
export function hasLiveSeat(record: MemberRecord | null | undefined): boolean {
  return (
    !!record && (record.status === "active" || record.status === "trialing")
  );
}

/**
 * Resolve canceledAt for a status transition: stamp it the first time a
 * member goes canceled, clear it when they come back active/trialing,
 * and leave it untouched for in-between states (past_due, etc.).
 */
function nextCanceledAt(
  prev: MemberRecord,
  status: MemberSubscriptionStatus
): number | null {
  if (status === "canceled") return prev.canceledAt ?? Date.now();
  if (status === "active" || status === "trialing") return null;
  return prev.canceledAt ?? null;
}

/**
 * Resolve billingFailure for a status transition. A member who is back
 * on active/trialing has a working card by definition, so the stale
 * decline goes with the status. Everything else keeps what it had:
 * `canceled` in particular has to hold on to it, because the win-back
 * surfaces are the last place the reason is still worth stating.
 */
function nextBillingFailure(
  prev: MemberRecord,
  status: MemberSubscriptionStatus
): BillingFailure | null {
  if (status === "active" || status === "trialing") return null;
  return prev.billingFailure ?? null;
}

/**
 * True when this record is mid-failed-renewal: Stripe has declined it
 * and neither a retry nor a cancellation has resolved it yet. The
 * member-area billing banner keys off this, so it deliberately excludes
 * `canceled` (that seat is already gone, and a "your card failed" bar
 * over a dead membership is just noise).
 */
export function isInDunning(
  record: { status: MemberSubscriptionStatus | null } | null | undefined
): boolean {
  if (!record) return false;
  return (
    record.status === "past_due" ||
    record.status === "unpaid" ||
    record.status === "incomplete"
  );
}

/**
 * True when the record's access comes from an unexpired prepaid gift
 * term. A converted recipient gets a fresh subscription-backed record
 * with these fields absent, so this flips false on conversion.
 */
export function hasActiveGiftSeat(
  record: Pick<MemberRecord, "status" | "giftExpiresAt"> | null
): boolean {
  if (!record) return false;
  if (record.status !== "active" && record.status !== "trialing") return false;
  return (
    typeof record.giftExpiresAt === "number" &&
    record.giftExpiresAt > Date.now()
  );
}

/* === Tier badges ============================================
   Three public badges earned by paying above the $13 standard rate.
   Derived from amount + interval at read time so a Stripe-side tier
   change shows up everywhere on the next page load — no badge field
   to keep in sync.
     HUNTER     ≥ $25/mo, < $50/mo     (olive)
     OPERATOR   ≥ $50/mo, < $100/mo    (olive — label distinguishes)
     APEX       ≥ $100/mo              (claret — the only saturated chip)
   Below $25/mo: no tier badge (founder badge still applies). */

export type TierBadge = "hunter" | "operator" | "apex";

const HUNTER_MONTHLY_CENTS = 2500;
const OPERATOR_MONTHLY_CENTS = 5000;
const APEX_MONTHLY_CENTS = 10000;

/**
 * Monthly-equivalent cents for a member. The pricing page uses ×10
 * for yearly (two months free), so we divide yearly cents by 10 to
 * compare against the monthly tier thresholds. Any other interval
 * unrecognized: treat as monthly to avoid downgrading badges by
 * accident.
 */
export function monthlyEquivalentCents(record: {
  amountCents: number;
  interval: "month" | "year";
}): number {
  if (record.interval === "year") {
    return Math.round(record.amountCents / 10);
  }
  return record.amountCents;
}

/**
 * The tier badge a member currently qualifies for, or null. Active /
 * trialing only — a churned subscription doesn't display a badge,
 * even if their last paid amount would have qualified.
 */
export function getTierBadge(
  record: Pick<MemberRecord, "amountCents" | "interval" | "status"> | null
): TierBadge | null {
  if (!record) return null;
  if (record.status !== "active" && record.status !== "trialing") return null;
  const monthly = monthlyEquivalentCents(record);
  if (monthly >= APEX_MONTHLY_CENTS) return "apex";
  if (monthly >= OPERATOR_MONTHLY_CENTS) return "operator";
  if (monthly >= HUNTER_MONTHLY_CENTS) return "hunter";
  return null;
}

/**
 * The founder slot a member is entitled to display, or null. Same
 * active/trialing gate as getTierBadge — a canceled founder doesn't
 * keep the chip on their next post.
 */
export function getFounderSlot(
  record: Pick<MemberRecord, "tier" | "founderSlot" | "status"> | null
): number | null {
  if (!record) return null;
  if (record.status !== "active" && record.status !== "trialing") return null;
  if (record.tier !== "founder") return null;
  return typeof record.founderSlot === "number" ? record.founderSlot : null;
}

/**
 * The charter slot a member is entitled to display, or null. Same
 * active/trialing gate as getFounderSlot. Founder + Charter are
 * mutually exclusive: a member can hold at most one of the two
 * permanent-earned slots (tier is a single value), so this returns
 * null whenever the member's tier is anything other than "charter".
 */
export function getCharterSlot(
  record: Pick<MemberRecord, "tier" | "charterSlot" | "status"> | null
): number | null {
  if (!record) return null;
  if (record.status !== "active" && record.status !== "trialing") return null;
  if (record.tier !== "charter") return null;
  return typeof record.charterSlot === "number" ? record.charterSlot : null;
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

export function isMembersStorageConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

/* === Founder counter ====================================== */

/**
 * Read the current Founder-slots-claimed count for display. Clamped to
 * the cap so the UI never shows "101 of 100" if the counter overshoots
 * under contention. Returns 0 when Redis is unconfigured.
 */
export async function getFounderClaimed(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const raw = await client.get<string | number | null>(FOUNDER_KEY);
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), FOUNDER_CAP);
}

/**
 * Atomically claim the next Founder slot. Returns slot number 1..CAP
 * on success, null when all slots are taken. The Lua script enforces
 * the cap inside a single Redis round-trip so concurrent webhook
 * firings can't both walk away with the last slot.
 */
export async function claimFounderSlot(): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  const script = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local cap = tonumber(ARGV[1])
    if current >= cap then
      return -1
    end
    return redis.call('INCR', KEYS[1])
  `;
  const result = await client.eval(
    script,
    [FOUNDER_KEY],
    [String(FOUNDER_CAP)]
  );
  if (typeof result === "number" && result > 0) return result;
  return null;
}

/**
 * Whether a fresh purchase would be eligible for the Founder rate.
 * Used by the sales page + checkout-create to surface the floor; the
 * webhook re-checks atomically before stamping the tier so a race
 * never gives out a 101st slot.
 */
export async function isFounderEligible(): Promise<boolean> {
  return (await getFounderClaimed()) < FOUNDER_CAP;
}

/* === Charter counter ====================================== */

/**
 * Read the current Charter-slots-claimed count for display. Clamped to
 * the cap so the UI never shows "101 of 100" if the counter overshoots
 * under contention. Returns 0 when Redis is unconfigured.
 */
export async function getCharterClaimed(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const raw = await client.get<string | number | null>(CHARTER_KEY);
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), CHARTER_CAP);
}

/**
 * Atomically claim the next Charter slot. Returns slot number 1..CAP
 * on success, null when all slots are taken. Same Lua script shape as
 * claimFounderSlot — single Redis round-trip enforces the cap so
 * concurrent webhook firings can't both walk away with the last slot.
 */
export async function claimCharterSlot(): Promise<number | null> {
  const client = getClient();
  if (!client) return null;
  const script = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local cap = tonumber(ARGV[1])
    if current >= cap then
      return -1
    end
    return redis.call('INCR', KEYS[1])
  `;
  const result = await client.eval(
    script,
    [CHARTER_KEY],
    [String(CHARTER_CAP)]
  );
  if (typeof result === "number" && result > 0) return result;
  return null;
}

/**
 * Whether a fresh purchase would be eligible for a Charter slot. Only
 * meaningful AFTER the founder cap is exhausted — callers should gate
 * with `!isFounderEligible() && isCharterEligible()`.
 */
export async function isCharterEligible(): Promise<boolean> {
  return (await getCharterClaimed()) < CHARTER_CAP;
}

/* === Member records ======================================= */

function parseMember(raw: unknown): MemberRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as MemberRecord)
      : (raw as MemberRecord);
  } catch {
    return null;
  }
}

export async function getMember(
  email: string,
  opts?: { prod?: boolean }
): Promise<MemberRecord | null> {
  const client = getClient();
  if (!client) return null;
  // opts.prod reads the unprefixed production key off the same client —
  // read-only, no writes. Lets the /admin/members page show the real
  // roster from a sandboxed local dev box without flipping the whole
  // app's keyspace. In production KEY_PREFIX is already "" so this is a
  // no-op. Mirrors the { prod } option on lib/pool.ts.
  const prefix = opts?.prod ? "member:" : MEMBER_PREFIX;
  const raw = await client.get<string>(`${prefix}${normEmail(email)}`);
  return parseMember(raw);
}

/**
 * Batched member lookup — one MGET round-trip for many emails instead
 * of N sequential GETs. Returned map is keyed by normalized email and
 * carries null for emails with no record (e.g. admin, who has a
 * profile but no member record). Used by /api/lounge to build the
 * per-author badge map without firing one Redis call per unique
 * commenter.
 */
export async function getMembersByEmails(
  emails: string[]
): Promise<Map<string, MemberRecord | null>> {
  const out = new Map<string, MemberRecord | null>();
  if (emails.length === 0) return out;
  const client = getClient();
  const unique = Array.from(new Set(emails.map(normEmail)));
  if (!client) {
    for (const e of unique) out.set(e, null);
    return out;
  }
  const keys = unique.map((e) => `${MEMBER_PREFIX}${e}`);
  const raw = (await client
    .mget<(string | null)[]>(...keys)
    .catch(() => [] as (string | null)[])) ?? [];
  unique.forEach((email, i) => {
    out.set(email, parseMember(raw[i] ?? null));
  });
  return out;
}

export async function getMemberByCustomerId(
  customerId: string
): Promise<MemberRecord | null> {
  const client = getClient();
  if (!client) return null;
  const email = await client.get<string>(
    `${MEMBER_BY_CUSTOMER_PREFIX}${customerId}`
  );
  if (!email) return null;
  return getMember(typeof email === "string" ? email : String(email));
}

export async function getMemberBySessionId(
  sessionId: string
): Promise<MemberRecord | null> {
  const client = getClient();
  if (!client) return null;
  const email = await client.get<string>(
    `${MEMBER_BY_SESSION_PREFIX}${sessionId}`
  );
  if (!email) return null;
  return getMember(typeof email === "string" ? email : String(email));
}

/**
 * Write a member record. Updates the primary record and the
 * customer-id reverse index. The session-id index is written
 * separately (see writeSessionIndex) since the webhook needs to set
 * it as part of the slot-claim transaction.
 */
export async function saveMember(record: MemberRecord): Promise<void> {
  const client = getClient();
  if (!client) return;
  const email = normEmail(record.email);
  const normalised: MemberRecord = { ...record, email };
  await client.set(
    `${MEMBER_PREFIX}${email}`,
    JSON.stringify(normalised)
  );
  await client.set(
    `${MEMBER_BY_CUSTOMER_PREFIX}${record.stripeCustomerId}`,
    email
  );
  // Maintain the fan-out broadcast index so notification triggers
  // (new essay, new voice memo, new wall) can iterate every active
  // member without a SCAN.
  await client.zadd(MEMBERS_ALL_INDEX, {
    score: record.createdAt,
    member: email,
  });
}

/**
 * Total count of distinct members ever saved. ZCARD on the broadcast
 * index — single round-trip, no per-member fetches. Used by the sales
 * page to surface "N readers in the room" social proof above the
 * scarcity strip. Includes canceled members historically (they joined
 * once); the count is a "joined ever" not "active right now" figure,
 * which is the honest framing for marketing copy on a sales page.
 */
export async function countAllMembers(): Promise<number> {
  const client = getClient();
  if (!client) return 0;
  const n = await client.zcard(MEMBERS_ALL_INDEX).catch(() => 0);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Newest-first list of every member email ever saved. Used by the
 * notifications fan-out broadcasts (essays, voice memos, walls).
 * For V1 with hundreds of members this is fine; if the list grows
 * past a few thousand, paginate and write notifications in batches
 * off the request path.
 */
export async function listAllMemberEmails(
  opts?: { prod?: boolean }
): Promise<string[]> {
  const client = getClient();
  if (!client) return [];
  // See getMember: opts.prod reads the unprefixed production index so the
  // admin roster is visible from a sandboxed dev box. Read-only.
  const indexKey = opts?.prod ? "members:all" : MEMBERS_ALL_INDEX;
  const raw = await client
    .zrange(indexKey, 0, -1, { rev: true })
    .catch(() => [] as unknown[]);
  return Array.isArray(raw)
    ? (raw.filter((v): v is string => typeof v === "string"))
    : [];
}

/**
 * Same as above but limited to members who currently have an
 * active/trialing subscription. Used for fan-outs that shouldn't
 * notify churned members.
 */
export async function listActiveMemberEmails(): Promise<string[]> {
  const all = await listAllMemberEmails();
  if (all.length === 0) return [];
  const active: string[] = [];
  for (const email of all) {
    const record = await getMember(email).catch(() => null);
    if (
      record &&
      (record.status === "active" || record.status === "trialing")
    ) {
      active.push(email);
    }
  }
  return active;
}

/**
 * Record the session id -> email binding so retries of the same
 * checkout.session.completed event skip the slot-claim path.
 */
export async function writeSessionIndex(
  sessionId: string,
  email: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.set(
    `${MEMBER_BY_SESSION_PREFIX}${sessionId}`,
    normEmail(email)
  );
}

/**
 * Update only the subscription status (e.g. on cancel, payment fail,
 * renewal). No-op when the member record doesn't exist yet — webhook
 * ordering can in rare cases deliver a lifecycle event before the
 * checkout.session.completed event that creates the record.
 */
export async function updateMemberStatus(
  customerId: string,
  status: MemberSubscriptionStatus
): Promise<void> {
  const member = await getMemberByCustomerId(customerId);
  if (!member) return;
  const next: MemberRecord = {
    ...member,
    status,
    canceledAt: nextCanceledAt(member, status),
    billingFailure: nextBillingFailure(member, status),
    updatedAt: Date.now(),
  };
  const client = getClient();
  if (!client) return;
  await client.set(
    `${MEMBER_PREFIX}${normEmail(member.email)}`,
    JSON.stringify(next)
  );
}

/**
 * Attach the facts behind a failed renewal to the member record.
 *
 * Called after the status flip on invoice.payment_failed, on every
 * attempt, so the record always reflects the LATEST decline rather than
 * the first one. That matters for the member-facing copy: a card that
 * expired on attempt one and hit insufficient funds on attempt four
 * should read as the second, because that's the wall they're standing
 * at now.
 *
 * No-op when the record doesn't exist (same webhook-ordering guard as
 * updateMemberStatus).
 */
export async function recordBillingFailure(
  customerId: string,
  failure: BillingFailure
): Promise<void> {
  const member = await getMemberByCustomerId(customerId);
  if (!member) return;
  const client = getClient();
  if (!client) return;
  const next: MemberRecord = {
    ...member,
    billingFailure: failure,
    updatedAt: Date.now(),
  };
  await client.set(
    `${MEMBER_PREFIX}${normEmail(member.email)}`,
    JSON.stringify(next)
  );
}

/**
 * Drop the failed-renewal facts once money has actually moved.
 *
 * Belt and braces alongside nextBillingFailure: invoice.paid only flips
 * the status when the member was delinquent, so a record that was
 * already active (a retry that cleared before our webhook saw the
 * failure, say) would otherwise keep a stale decline forever and show a
 * banner to a member in perfectly good standing.
 */
export async function clearBillingFailure(customerId: string): Promise<void> {
  const member = await getMemberByCustomerId(customerId);
  if (!member || !member.billingFailure) return;
  const client = getClient();
  if (!client) return;
  const next: MemberRecord = {
    ...member,
    billingFailure: null,
    updatedAt: Date.now(),
  };
  await client.set(
    `${MEMBER_PREFIX}${normEmail(member.email)}`,
    JSON.stringify(next)
  );
}

/**
 * Update a member's subscription details from a Stripe webhook —
 * status plus the live price (so tier-badge changes via the Customer
 * Portal propagate to the site without a second event). Only writes
 * provided fields; nullish values pass through unchanged.
 */
export async function updateMemberSubscription(
  customerId: string,
  fields: {
    status?: MemberSubscriptionStatus;
    interval?: "month" | "year";
    amountCents?: number;
  }
): Promise<void> {
  const member = await getMemberByCustomerId(customerId);
  if (!member) return;
  const resolvedStatus = fields.status ?? member.status;
  const next: MemberRecord = {
    ...member,
    status: resolvedStatus,
    canceledAt: nextCanceledAt(member, resolvedStatus),
    billingFailure: nextBillingFailure(member, resolvedStatus),
    interval: fields.interval ?? member.interval,
    amountCents:
      typeof fields.amountCents === "number"
        ? fields.amountCents
        : member.amountCents,
    updatedAt: Date.now(),
  };
  const client = getClient();
  if (!client) return;
  await client.set(
    `${MEMBER_PREFIX}${normEmail(member.email)}`,
    JSON.stringify(next)
  );
}

/**
 * Wait briefly for the webhook to land a member record matching this
 * session id. Used by /membership/success after the Stripe redirect:
 * the webhook fires async (~hundreds of ms) but we want the success
 * page to surface tier + slot without a client-side spinner.
 */
export async function pollMemberBySession(
  sessionId: string,
  attempts = 6,
  delayMs = 200
): Promise<MemberRecord | null> {
  for (let i = 0; i < attempts; i++) {
    const member = await getMemberBySessionId(sessionId);
    if (member) return member;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}
