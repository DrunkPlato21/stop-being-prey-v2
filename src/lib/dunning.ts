import { Redis } from "@upstash/redis";

// Dunning state for a failed membership renewal.
//
// Stripe retries a failed invoice on its own schedule (Smart Retries,
// roughly every other day for two to three weeks) and fires a fresh
// invoice.payment_failed webhook on EVERY attempt. We used to email on
// every one of those events with byte-identical copy, so one member got
// nine copies of the same mild note and never once heard the sentence
// that actually mattered: the seat is about to close.
//
// This module collapses that stream of identical events into a designed
// three-stage sequence. Each stage is claimed atomically, so a Stripe
// webhook redelivery or two retries landing at once can never
// double-send. Stage is derived from Stripe's own retry bookkeeping
// (attempt_count + next_payment_attempt) rather than a timer of ours,
// so the final notice lands on the real deadline instead of a guess.

// SAFETY: dev sandbox namespace, same reasoning as members.ts / pool.ts.
// Local dev shares ONE production Redis. Without this, testing a failed
// renewal on localhost would burn the live stage claims for a real
// member and silence the emails they were owed. Production
// (NODE_ENV=production on Vercel) uses no prefix.
const KEY_PREFIX =
  process.env.BILLING_KEY_PREFIX ??
  (process.env.NODE_ENV === "production" ? "" : "dev:");

const INVOICE_PREFIX = `${KEY_PREFIX}dunning:invoice:`;
const SUBSCRIPTION_PREFIX = `${KEY_PREFIX}dunning:sub:`;

// Long enough to outlive any Stripe retry window (max ~3 weeks) plus a
// reactivation cycle, short enough that dead invoices don't accumulate.
const STAGE_TTL_SECONDS = 60 * 60 * 24 * 90;

/**
 * A single member-facing touch in the failed-renewal sequence.
 *
 * first  — the soft heads-up on the first failure. Assume a reissued card.
 * nudge  — one mid-sequence reminder once it's clearly not a blip.
 * final  — Stripe has no automatic retry left. The seat closes after this.
 * lapsed — the subscription actually died. Win-back, scoped to the sub.
 */
export type DunningStage = "first" | "nudge" | "final" | "lapsed";

/** The member-facing stages driven by a failed invoice. */
export type FailureStage = Exclude<DunningStage, "lapsed">;

// Stripe attempt number at which the mid-sequence nudge fires. Attempt 1
// gets the soft notice, then we stay quiet. A card that fails twice is
// usually still just a reissue in the mail, so nagging at attempt 2 buys
// irritation and nothing else.
const NUDGE_AT_ATTEMPT = 3;

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

/**
 * Which stage (if any) this failure event should send.
 *
 * Pure, so the sequence can be reasoned about without Redis. `sent` is
 * the set of stages already delivered for this invoice.
 */
export function decideStage(args: {
  attemptCount: number;
  nextPaymentAttempt: number | null;
  sent: ReadonlySet<DunningStage>;
}): FailureStage | null {
  const { attemptCount, nextPaymentAttempt, sent } = args;

  // No further automatic retry is queued, so this is the last moment we
  // can honestly tell them the seat is closing. This deliberately wins
  // over the softer stages: a card that hard-declines on attempt 1 (a
  // non-retryable code, or retries switched off) jumps straight here
  // rather than getting a gentle note and then silence forever. The
  // final copy is written to stand alone for exactly that reason.
  if (nextPaymentAttempt === null) {
    return sent.has("final") ? null : "final";
  }

  // Attempt 1 is the genuine first failure. A LATER attempt with no
  // stage on record means we joined the window late: deployed
  // mid-dunning, or the claim key expired. Those members already got
  // the soft notice from the old code path, so opening with it again
  // would be exactly the duplicate this module exists to remove. Skip
  // ahead and let the nudge and the final notice carry them out.
  if (!sent.has("first") && attemptCount <= 1) return "first";
  if (!sent.has("nudge") && attemptCount >= NUDGE_AT_ATTEMPT) return "nudge";

  // Every other retry in the window. Silence is the feature.
  return null;
}

async function readSent(key: string): Promise<Set<DunningStage>> {
  const redis = getClient();
  if (!redis) return new Set();
  const members = await redis.smembers(key);
  return new Set((members ?? []) as DunningStage[]);
}

/**
 * Atomically claim a stage. True means "you send it", false means
 * somebody already did. SADD returning 1 is the claim, so concurrent
 * webhook deliveries resolve to exactly one sender.
 */
async function claim(key: string, stage: DunningStage): Promise<boolean> {
  const redis = getClient();
  if (!redis) return false;
  const added = await redis.sadd(key, stage);
  if (added === 1) {
    // Refresh on every claim so the window tracks the live sequence.
    await redis.expire(key, STAGE_TTL_SECONDS).catch(() => {});
    return true;
  }
  return false;
}

/**
 * Decide and claim the next stage for a failed invoice in one step.
 * Returns null when this event should send nothing.
 *
 * Fails CLOSED when Redis is unreachable. Without the claim we cannot
 * tell attempt 1 from attempt 9, and the failure mode of guessing wrong
 * is the nine-identical-emails bug we are fixing. In practice this is
 * unreachable: the caller has to read the member record out of the same
 * Redis to have an address to send to at all.
 */
export async function claimFailureStage(args: {
  invoiceId: string;
  attemptCount: number;
  nextPaymentAttempt: number | null;
}): Promise<FailureStage | null> {
  const redis = getClient();
  if (!redis) {
    console.error(
      "[dunning] Redis unconfigured, suppressing payment-failed email to avoid duplicate sends."
    );
    return null;
  }

  const key = `${INVOICE_PREFIX}${args.invoiceId}`;
  const sent = await readSent(key);
  const stage = decideStage({
    attemptCount: args.attemptCount,
    nextPaymentAttempt: args.nextPaymentAttempt,
    sent,
  });
  if (!stage) return null;

  return (await claim(key, stage)) ? stage : null;
}

/**
 * Claim the one-time win-back for a subscription that actually died.
 * Scoped to the subscription id, so a member who reactivates and later
 * lapses again gets a fresh claim on the new subscription.
 */
export async function claimLapse(subscriptionId: string): Promise<boolean> {
  return claim(`${SUBSCRIPTION_PREFIX}${subscriptionId}`, "lapsed");
}

/**
 * Drop the sequence for an invoice that finally cleared, so the next
 * renewal failure months from now starts over at the soft notice
 * instead of opening with a final warning.
 */
export async function clearInvoiceDunning(invoiceId: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  await redis.del(`${INVOICE_PREFIX}${invoiceId}`).catch(() => {});
}

/** Which stages have already gone out. Read-only, for ops scripts. */
export async function sentStages(invoiceId: string): Promise<DunningStage[]> {
  return [...(await readSent(`${INVOICE_PREFIX}${invoiceId}`))];
}
