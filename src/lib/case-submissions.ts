import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";

// Storage for Case File submissions. Three tiers share the same
// record shape:
//   - free            no payment, member's case is in the queue
//                     immediately and may become a public Case File
//   - public_review   $25, guaranteed turnaround, becomes a public
//                     Case File (anonymization configurable)
//   - private_review  $50, guaranteed turnaround, stays private
//
// Lifecycle (all tiers):
//   submitted → (paid for paid tiers) → in_review → published → completed
//   or → refunded (paid only)
// Free tier never enters `paid`; it flows submitted → in_review → ...
//
// Architectural note: this lib is named for the "case" use case but
// the schema is deliberately generic. Future long-form member message
// types can either reuse the same record (extending `tier` and
// re-using `title`/`situation`/etc as freeform `slot1`/`slot2`) or
// fork into their own keys with a parallel shape. The status enum,
// indexes, and identifier scheme are all type-agnostic.
//
// Redis schema:
//   case-submission:<id>            JSON CaseSubmission
//   case-submissions                ZSET, score=createdAt, member=id
//   case-submissions:by-email:<e>   ZSET, score=createdAt, member=id
//   case-submissions:by-status:<s>  ZSET, score=createdAt, member=id
//   case-submission:by-checkout:<sid>  string id (paid-flow idempotency)

const RECORD_PREFIX = "case-submission:";
const ALL_INDEX = "case-submissions";
const BY_EMAIL_PREFIX = "case-submissions:by-email:";
const BY_STATUS_PREFIX = "case-submissions:by-status:";
const BY_CHECKOUT_PREFIX = "case-submission:by-checkout:";

export const PUBLIC_REVIEW_CENTS = 2500;
export const PRIVATE_REVIEW_CENTS = 5000;

export type CaseTier = "free" | "public_review" | "private_review";

export type Anonymization = "full_name" | "first_name" | "anonymous";

export type CaseStatus =
  | "submitted"
  | "paid"
  | "in_review"
  | "published"
  | "completed"
  | "refunded";

export const ALL_STATUSES: CaseStatus[] = [
  "submitted",
  "paid",
  "in_review",
  "published",
  "completed",
  "refunded",
];

export const ALL_TIERS: CaseTier[] = [
  "free",
  "public_review",
  "private_review",
];

export type CaseSubmission = {
  id: string;
  memberEmail: string;
  /** Display name captured at submit time so admin email has it
      without a separate profile lookup. */
  memberDisplayName: string;
  tier: CaseTier;
  title: string;
  situation: string;
  move: string;
  attemptedResponse: string;
  helpWanted: string;
  /** Public Review only. Null for private. */
  anonymization: Anonymization | null;
  status: CaseStatus;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeAmountCents: number | null;
  createdAt: number;
  paidAt: number | null;
  completedAt: number | null;
};

const MAX_TITLE = 200;
const MAX_SITUATION = 1000;
const MAX_MOVE = 500;
const MAX_ATTEMPTED = 500;
const MAX_HELP = 500;

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

export function isCaseSubmissionsConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function sanitizeLine(input: string, cap: number): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, cap);
}

function sanitizeBlock(input: string, cap: number): string {
  return input
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, cap);
}

export type CreateInput = {
  memberEmail: string;
  memberDisplayName: string;
  tier: CaseTier;
  title: string;
  situation: string;
  move: string;
  attemptedResponse?: string;
  helpWanted?: string;
  anonymization?: Anonymization | null;
};

export type CreateResult =
  | { ok: true; submission: CaseSubmission }
  | {
      ok: false;
      error:
        | "storage_unavailable"
        | "missing_title"
        | "missing_situation"
        | "missing_move"
        | "missing_anonymization"
        | "invalid_tier";
    };

export async function createSubmission(
  input: CreateInput
): Promise<CreateResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  if (
    input.tier !== "free" &&
    input.tier !== "public_review" &&
    input.tier !== "private_review"
  ) {
    return { ok: false, error: "invalid_tier" };
  }

  const title = sanitizeLine(input.title, MAX_TITLE);
  if (!title) return { ok: false, error: "missing_title" };

  const situation = sanitizeBlock(input.situation, MAX_SITUATION);
  if (!situation) return { ok: false, error: "missing_situation" };

  const move = sanitizeBlock(input.move, MAX_MOVE);
  if (!move) return { ok: false, error: "missing_move" };

  // Free tier defaults anonymization to first_name per spec.
  // public_review requires an explicit choice. private_review never
  // surfaces it (stored as null).
  let anonymization: Anonymization | null = null;
  if (input.tier === "free") {
    const explicit = input.anonymization;
    anonymization =
      explicit === "full_name" || explicit === "anonymous"
        ? explicit
        : "first_name";
  } else if (input.tier === "public_review") {
    if (
      input.anonymization !== "full_name" &&
      input.anonymization !== "first_name" &&
      input.anonymization !== "anonymous"
    ) {
      return { ok: false, error: "missing_anonymization" };
    }
    anonymization = input.anonymization;
  }

  const attemptedResponse = sanitizeBlock(
    input.attemptedResponse ?? "",
    MAX_ATTEMPTED
  );
  const helpWanted = sanitizeBlock(input.helpWanted ?? "", MAX_HELP);

  const id = randomUUID();
  const now = Date.now();
  const submission: CaseSubmission = {
    id,
    memberEmail: normEmail(input.memberEmail),
    memberDisplayName: sanitizeLine(input.memberDisplayName, 120),
    tier: input.tier,
    title,
    situation,
    move,
    attemptedResponse,
    helpWanted,
    anonymization,
    status: "submitted",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    stripeAmountCents: null,
    createdAt: now,
    paidAt: null,
    completedAt: null,
  };

  await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(submission));
  await client.zadd(ALL_INDEX, { score: now, member: id });
  await client.zadd(`${BY_EMAIL_PREFIX}${submission.memberEmail}`, {
    score: now,
    member: id,
  });
  await client.zadd(`${BY_STATUS_PREFIX}submitted`, {
    score: now,
    member: id,
  });

  return { ok: true, submission };
}

function parseRecord(raw: unknown): CaseSubmission | null {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as CaseSubmission)
      : (raw as CaseSubmission);
  } catch {
    return null;
  }
}

export async function getSubmission(
  id: string
): Promise<CaseSubmission | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${RECORD_PREFIX}${id}`);
  return parseRecord(raw);
}

/**
 * Bind a Stripe checkout session id to a submission. Stored both on
 * the record and as a reverse-lookup key so the webhook can find the
 * submission idempotently even if the metadata is missing.
 */
export async function attachCheckoutSession(
  id: string,
  checkoutSessionId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const submission = await getSubmission(id);
  if (!submission) return;
  const next: CaseSubmission = {
    ...submission,
    stripeCheckoutSessionId: checkoutSessionId,
  };
  await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(next));
  await client.set(`${BY_CHECKOUT_PREFIX}${checkoutSessionId}`, id);
}

export async function getIdByCheckoutSession(
  checkoutSessionId: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(
    `${BY_CHECKOUT_PREFIX}${checkoutSessionId}`
  );
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Webhook landing. Flips the submission from `submitted` → `paid` and
 * captures the payment intent id + amount. Returns the updated record,
 * or null when the submission doesn't exist. Re-running this on the
 * same submission is a no-op (returns the existing paid record) so
 * Stripe retries are safe.
 */
export async function markPaid(
  id: string,
  args: { stripePaymentIntentId: string | null; amountCents: number }
): Promise<CaseSubmission | null> {
  const client = getClient();
  if (!client) return null;
  const submission = await getSubmission(id);
  if (!submission) return null;
  if (submission.status === "paid" || submission.status === "in_review" ||
      submission.status === "completed") {
    // Already past the paid gate — return existing record so the
    // caller can still send the confirmation email if it crashed
    // mid-flight last time (and use the existing-state idempotency
    // marker the webhook itself maintains).
    return submission;
  }
  const next: CaseSubmission = {
    ...submission,
    status: "paid",
    stripePaymentIntentId: args.stripePaymentIntentId,
    stripeAmountCents: args.amountCents,
    paidAt: Date.now(),
  };
  await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(next));
  await reindexStatus(submission.status, "paid", id, next.createdAt);
  return next;
}

async function reindexStatus(
  from: CaseStatus,
  to: CaseStatus,
  id: string,
  createdAt: number
): Promise<void> {
  const client = getClient();
  if (!client) return;
  if (from !== to) {
    await client.zrem(`${BY_STATUS_PREFIX}${from}`, id);
  }
  await client.zadd(`${BY_STATUS_PREFIX}${to}`, {
    score: createdAt,
    member: id,
  });
}

/**
 * Admin-only status mutation. Idempotent: if the submission is
 * already at `next`, no write happens. Returns null when the
 * submission doesn't exist.
 */
export async function setStatus(
  id: string,
  next: CaseStatus
): Promise<CaseSubmission | null> {
  const client = getClient();
  if (!client) return null;
  if (!ALL_STATUSES.includes(next)) return null;
  const submission = await getSubmission(id);
  if (!submission) return null;
  if (submission.status === next) return submission;

  const now = Date.now();
  const updated: CaseSubmission = {
    ...submission,
    status: next,
    // Stamp completedAt on the terminal transitions.
    completedAt:
      next === "completed" || next === "refunded"
        ? submission.completedAt ?? now
        : submission.completedAt,
    // If the admin marks a free submission as paid (unlikely but
    // possible), don't fabricate a paidAt — leave it.
  };
  await client.set(`${RECORD_PREFIX}${id}`, JSON.stringify(updated));
  await reindexStatus(submission.status, next, id, submission.createdAt);
  return updated;
}

/**
 * Newest-first list of submissions, optionally filtered by tier
 * and/or status. Drives the admin inbox. The filters are applied
 * client-side after fetching to keep the implementation simple — at
 * launch volume (single-digit submissions per day) this is fine.
 */
export async function listAll(opts?: {
  tier?: CaseTier;
  status?: CaseStatus;
  limit?: number;
}): Promise<CaseSubmission[]> {
  const client = getClient();
  if (!client) return [];
  const limit = opts?.limit ?? 200;

  const indexKey = opts?.status
    ? `${BY_STATUS_PREFIX}${opts.status}`
    : ALL_INDEX;

  const ids = (await client
    .zrange(indexKey, 0, limit - 1, { rev: true })
    .catch(() => [] as unknown[])) as string[];
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const keys = ids.map((id) => `${RECORD_PREFIX}${id}`);
  const raw = (await client.mget<(string | null)[]>(...keys)) ?? [];
  const out: CaseSubmission[] = [];
  for (const value of raw) {
    const parsed = parseRecord(value);
    if (!parsed) continue;
    if (opts?.tier && parsed.tier !== opts.tier) continue;
    out.push(parsed);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export function tierAmountCents(tier: CaseTier): number {
  if (tier === "free") return 0;
  return tier === "public_review" ? PUBLIC_REVIEW_CENTS : PRIVATE_REVIEW_CENTS;
}

export function tierLabel(tier: CaseTier): string {
  if (tier === "free") return "Free";
  return tier === "public_review" ? "Public Review" : "Private Review";
}

export function statusLabel(status: CaseStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "paid":
      return "Paid";
    case "in_review":
      return "In review";
    case "published":
      return "Published";
    case "completed":
      return "Completed";
    case "refunded":
      return "Refunded";
  }
}

export function anonymizationLabel(a: Anonymization): string {
  if (a === "full_name") return "Use my full name";
  if (a === "first_name") return "Use my first name only";
  return "Anonymous";
}
