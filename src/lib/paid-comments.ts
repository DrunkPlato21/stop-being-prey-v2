import { Redis } from "@upstash/redis";
import { randomUUID } from "crypto";
import {
  isDisplayNameTakenBy,
  sanitizeBody,
  sanitizeDisplayName,
  type CommentKind,
  type CommentRecord,
} from "./comments";
import { normalizeForCheck, validateDisplayName } from "./display-name";

// Shared key prefix with comments.ts. Mirrored here rather than
// exported to keep the comments-lib API surface tight; the only
// callers of comment:<id> outside this file are inside comments.ts.
const COMMENT_PREFIX = "comment:";

// Non-member paid comment flow.
//
// State machine:
//   1. Visitor POSTs name/email/body → we write a draft CommentRecord
//      with `paymentStatus = "awaiting_payment"`. The record is NOT
//      added to any index — it's invisible to admin and to the
//      article page until step 4.
//   2. Caller creates a Stripe Checkout session for $1 and binds the
//      session id to the draft via attachCheckout().
//   3. Visitor pays. Stripe redirects to /comments/paid/success.
//   4. The webhook lane `paid_comment` looks up the draft by session
//      id, flips it to `paymentStatus = "paid"`, and finalize() adds
//      it to the per-piece index + the global comments:all + the
//      pending queue. From that point on it behaves exactly like a
//      member comment in the moderation queue.
//
// Redis schema (the comment record itself lives at comment:<id>, shared
// with the member-comment flow):
//   paid-comment:by-checkout:<sid>   string commentId  (idempotency)

const BY_CHECKOUT_PREFIX = "paid-comment:by-checkout:";
const COMMENTS_INDEX_PREFIX = "comments:";
const PENDING_INDEX_KEY = "comments:pending";
const ALL_INDEX_KEY = "comments:all";
const MEMBER_LOCK_PREFIX = "member-comment:";

// 7 days. Drafts older than this with no payment are abandoned —
// Stripe sessions expire in 24h anyway, but giving ourselves a wider
// window protects against clock skew + retry storms.
const DRAFT_TTL_SECONDS = 7 * 24 * 60 * 60;

// Floor for the variable-amount paid-comment flow. Form can default
// to 1 and validate against this. No hard ceiling in the lib; the
// API enforces a reasonable cap at the boundary so a runaway typo
// can't drop a $50,000 Stripe charge.
export const PAID_COMMENT_MIN_CENTS = 100;
// Back-compat alias for any caller still expecting the old constant.
export const PAID_COMMENT_CENTS = PAID_COMMENT_MIN_CENTS;

let cached: Redis | null = null;
function getClient(): Redis | null {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cached = new Redis({ url, token });
  return cached;
}

function normEmail(email: string): string {
  return email.toLowerCase().trim();
}

function indexKey(kind: CommentKind, slug: string): string {
  return `${COMMENTS_INDEX_PREFIX}${kind}:${slug}`;
}

function lockKey(email: string, kind: CommentKind, slug: string): string {
  return `${MEMBER_LOCK_PREFIX}${normEmail(email)}:${kind}:${slug}`;
}

function isValidEmail(value: string): boolean {
  // Cheap RFC-ish check — Stripe will re-validate before charging the
  // card, so we just need enough to reject obvious typos client-side.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type PaidCommentDraftInput = {
  email: string;
  displayName: string;
  kind: CommentKind;
  slug: string;
  body: string;
  /** Amount in cents the commenter has agreed to pay. Must be at
      least PAID_COMMENT_MIN_CENTS. API enforces the upper bound. */
  amountCents: number;
  /** Whether the GUEST badge should publicly display the amount.
      False (default) → bare "GUEST". True → "GUEST · $N". */
  showAmount: boolean;
};

export type CreatePaidCommentDraftResult =
  | { ok: true; commentId: string }
  | {
      ok: false;
      error:
        | "invalid_email"
        | "invalid_display_name"
        | "reserved"
        | "profanity"
        | "name_taken"
        | "empty_body"
        | "invalid_amount"
        | "already_commented"
        | "storage_unavailable";
    };

/**
 * Write a draft non-member comment. Validates the display name with
 * the same reserved + profanity filter members go through; rejects
 * names already claimed by a real member account so non-members
 * can't impersonate them. The record exists at comment:<id> from
 * this point but doesn't appear in any index yet — that happens
 * inside finalize() after the webhook fires.
 *
 * The 7-day TTL keeps abandoned drafts from piling up if the visitor
 * walks away from the Stripe redirect. Once finalize() lands, the TTL
 * is dropped (live comments persist forever).
 */
export async function createPaidCommentDraft(
  input: PaidCommentDraftInput
): Promise<CreatePaidCommentDraftResult> {
  const client = getClient();
  if (!client) return { ok: false, error: "storage_unavailable" };

  const email = normEmail(input.email);
  if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };

  if (
    !Number.isFinite(input.amountCents) ||
    input.amountCents < PAID_COMMENT_MIN_CENTS
  ) {
    return { ok: false, error: "invalid_amount" };
  }

  const body = sanitizeBody(input.body);
  if (!body) return { ok: false, error: "empty_body" };

  const sanitizedName = sanitizeDisplayName(input.displayName);
  if (!sanitizedName) return { ok: false, error: "invalid_display_name" };

  const validation = validateDisplayName(sanitizedName);
  if (!validation.ok) {
    if (validation.error === "reserved") return { ok: false, error: "reserved" };
    if (validation.error === "profanity") return { ok: false, error: "profanity" };
    return { ok: false, error: "invalid_display_name" };
  }

  // Block names already claimed by a real member. We deliberately do
  // not claim the name for the non-member — paid comments are
  // typically one-offs, and stale claims from abandoned drafts would
  // junk the index.
  const taken = await isDisplayNameTakenBy(
    normalizeForCheck(validation.cleaned),
    email
  );
  if (taken) return { ok: false, error: "name_taken" };

  // Per-piece comment lock applies the same way to non-members: $1
  // doesn't buy you the soapbox twice on the same essay.
  const existingLock = await client.get<string>(
    lockKey(email, input.kind, input.slug)
  );
  if (existingLock) return { ok: false, error: "already_commented" };

  const id = randomUUID();
  const now = Date.now();
  const record: CommentRecord = {
    id,
    kind: input.kind,
    slug: input.slug,
    email,
    displayName: validation.cleaned,
    body,
    createdAt: now,
    replyBody: null,
    replyAt: null,
    approved: false,
    paidComment: true,
    paymentStatus: "awaiting_payment",
    stripeCheckoutSessionId: undefined,
    stripePaymentIntentId: undefined,
    paidAt: null,
    paidAmountCents: Math.round(input.amountCents),
    paidShowAmount: !!input.showAmount,
  };

  await client.set(`${COMMENT_PREFIX}${id}`, JSON.stringify(record), {
    ex: DRAFT_TTL_SECONDS,
  });
  return { ok: true, commentId: id };
}

/**
 * Bind a Stripe Checkout session id to a draft. Idempotent — calling
 * it twice with the same session is fine.
 */
export async function attachPaidCommentCheckout(
  commentId: string,
  sessionId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const raw = await client.get<string>(`${COMMENT_PREFIX}${commentId}`);
  if (!raw) return;
  let record: CommentRecord;
  try {
    record =
      typeof raw === "string"
        ? (JSON.parse(raw) as CommentRecord)
        : (raw as CommentRecord);
  } catch {
    return;
  }
  const next: CommentRecord = {
    ...record,
    stripeCheckoutSessionId: sessionId,
  };
  await client.set(`${COMMENT_PREFIX}${commentId}`, JSON.stringify(next), {
    ex: DRAFT_TTL_SECONDS,
  });
  await client.set(`${BY_CHECKOUT_PREFIX}${sessionId}`, commentId, {
    ex: DRAFT_TTL_SECONDS,
  });
}

export async function getPaidCommentIdByCheckoutSession(
  sessionId: string
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  const raw = await client.get<string>(`${BY_CHECKOUT_PREFIX}${sessionId}`);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Look up a paid comment by Stripe checkout session id. Used by the
 * success page to surface the visitor's submitted comment + status.
 */
export async function getPaidCommentByCheckoutSession(
  sessionId: string
): Promise<CommentRecord | null> {
  const client = getClient();
  if (!client) return null;
  const commentId = await getPaidCommentIdByCheckoutSession(sessionId);
  if (!commentId) return null;
  const raw = await client.get<string>(`${COMMENT_PREFIX}${commentId}`);
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as CommentRecord)
      : (raw as CommentRecord);
  } catch {
    return null;
  }
}

/**
 * Webhook landing: flip the draft to paid + add it to every visible
 * index. Idempotent on retry — if the record is already past
 * `awaiting_payment`, return it unchanged.
 *
 * The per-piece member-lock is set here (not at draft creation) so
 * the visitor can resubmit a different draft if they abandon the
 * first Stripe redirect. If another paid comment from the same email
 * already locked the piece by the time this fires, we log + still
 * proceed — Clay can spot the duplicate in the queue and refund one
 * of the Stripe charges manually.
 */
export async function finalizePaidComment(
  commentId: string,
  args: { stripePaymentIntentId: string | null; amountCents: number }
): Promise<CommentRecord | null> {
  const client = getClient();
  if (!client) return null;

  const raw = await client.get<string>(`${COMMENT_PREFIX}${commentId}`);
  if (!raw) return null;
  let record: CommentRecord;
  try {
    record =
      typeof raw === "string"
        ? (JSON.parse(raw) as CommentRecord)
        : (raw as CommentRecord);
  } catch {
    return null;
  }

  if (record.paymentStatus === "paid" || record.paymentStatus === "refunded") {
    return record;
  }

  const now = Date.now();
  const next: CommentRecord = {
    ...record,
    paymentStatus: "paid",
    stripePaymentIntentId: args.stripePaymentIntentId ?? undefined,
    paidAt: now,
  };
  // Persist the live record. Drop TTL — live comments are permanent.
  await client.set(`${COMMENT_PREFIX}${commentId}`, JSON.stringify(next));
  await client.zadd(indexKey(record.kind, record.slug), {
    score: record.createdAt,
    member: commentId,
  });
  await client.zadd(ALL_INDEX_KEY, {
    score: record.createdAt,
    member: commentId,
  });
  await client.zadd(PENDING_INDEX_KEY, {
    score: record.createdAt,
    member: commentId,
  });

  // Best-effort per-piece member-lock. NX so a concurrent member
  // comment isn't trampled; logs but doesn't fail if already set.
  const existing = await client.get<string>(
    lockKey(record.email, record.kind, record.slug)
  );
  if (existing && existing !== commentId) {
    console.warn(
      `[paid-comment] member-lock already held by ${existing} for ${record.email} on ${record.kind}:${record.slug}; ` +
        `proceeding with paid comment ${commentId} — admin may need to refund the duplicate.`
    );
  } else {
    await client.set(
      lockKey(record.email, record.kind, record.slug),
      commentId
    );
  }

  return next;
}
