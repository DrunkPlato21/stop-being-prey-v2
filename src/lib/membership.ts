import Stripe from "stripe";
import {
  claimCharterSlot,
  claimFounderSlot,
  getMember,
  isCharterEligible,
  isFounderEligible,
  saveMember,
  type Tier,
} from "./members";

// Stripe-side helpers for membership. Customer lookup by email, active
// subscription check, checkout session creation, customer portal URL.
//
// Pricing is dynamic + pay-what-you-want:
//   - Founder tier ($8 floor monthly / $80 yearly) available until the
//     first 100 founder slots are claimed (see members.ts).
//   - Charter tier (same $13 floor as Regular) for the next 200 sign-
//     ups after the Founder cap fills. Same floor as Regular — Charter
//     is a permanent-earned badge, not a price tier; the difference is
//     purely the badge claim.
//   - Regular tier ($13 floor monthly / $130 yearly) thereafter.
//   - The slider lets a buyer pay anything ≥ the floor; the server
//     enforces the floor at checkout-create time and the webhook
//     atomically claims the founder/charter slot (or stamps Regular if
//     the race lost). Annual is exactly 10× monthly so the toggle's
//     "save 2 months" framing stays honest.

let cached: Stripe | null = null;

function client(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
  });
  return cached;
}

export type MembershipPlan = "monthly" | "yearly";

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

/* === Pricing floors ======================================== */

export const FOUNDER_MONTHLY_FLOOR_CENTS = 800;
export const FOUNDER_YEARLY_FLOOR_CENTS = 8000;
export const REGULAR_MONTHLY_FLOOR_CENTS = 1300;
export const REGULAR_YEARLY_FLOOR_CENTS = 13000;

// Hard upper cap on PWYW amount. Defends against test-mode finger-slips
// and bot abuse; well above any plausible real contribution.
const MAX_AMOUNT_CENTS = 100_000;

export function floorCentsFor(
  plan: MembershipPlan,
  founderEligible: boolean
): number {
  if (founderEligible) {
    return plan === "monthly"
      ? FOUNDER_MONTHLY_FLOOR_CENTS
      : FOUNDER_YEARLY_FLOOR_CENTS;
  }
  return plan === "monthly"
    ? REGULAR_MONTHLY_FLOOR_CENTS
    : REGULAR_YEARLY_FLOOR_CENTS;
}

/* === Stripe customer + subscription lookup ================= */

/**
 * Find a Stripe Customer by email. Stripe allows multiple customers
 * with the same email; we take the most recently created one (which is
 * the one most likely to hold the live subscription).
 */
async function findCustomerByEmail(
  stripe: Stripe,
  email: string
): Promise<Stripe.Customer | null> {
  const search = await stripe.customers.list({
    email: email.toLowerCase().trim(),
    limit: 5,
  });
  if (search.data.length === 0) return null;
  return search.data.sort((a, b) => b.created - a.created)[0];
}

/**
 * Determine whether the given email currently has an active membership.
 * Counts both `active` and `trialing` statuses. Subscriptions with
 * `cancel_at_period_end: true` remain active until period end.
 */
export async function emailHasActiveMembership(
  email: string
): Promise<{ active: boolean; customerId: string | null }> {
  // Dev-only bypass: when DEV_AUTO_GRANT=1 in a non-production env,
  // treat any email as an active member. Lets us exercise the magic
  // link + session flow without a real Stripe subscription.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTO_GRANT === "1"
  ) {
    const normalised = email.toLowerCase().trim();
    return { active: true, customerId: `dev_${normalised}` };
  }

  const stripe = client();
  if (!stripe) return { active: false, customerId: null };

  const customer = await findCustomerByEmail(stripe, email);
  if (!customer) return { active: false, customerId: null };

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    limit: 10,
  });
  const hasActive = subs.data.some(
    (s) => s.status === "active" || s.status === "trialing"
  );
  return { active: hasActive, customerId: customer.id };
}

/* === Dev member auto-grant =================================
   When DEV_AUTO_GRANT=1 in a non-production env, the magic-link
   endpoint mints a session without requiring a real Stripe sub.
   That's enough for auth, but the rest of the site (chrome,
   badges, member account page) gates on a MemberRecord. Without
   this helper a "dev grant" user lands in a half-state where they
   can sign in but the chrome treats them as logged-out and badges
   never render.

   This function bridges the gap: on dev sign-in, ensure the email
   has a real MemberRecord. Tier is configurable via env var
   DEV_AUTO_GRANT_TIER so a tester can issue themselves any badge
   without going through Stripe:

     DEV_AUTO_GRANT_TIER=founder    →  $8/mo founder, claims a slot
     DEV_AUTO_GRANT_TIER=charter    →  $13/mo charter, claims a slot
     DEV_AUTO_GRANT_TIER=regular    →  $13/mo (default, no badge)
     DEV_AUTO_GRANT_TIER=hunter     →  $25/mo regular
     DEV_AUTO_GRANT_TIER=operator   →  $50/mo regular
     DEV_AUTO_GRANT_TIER=apex       →  $100/mo regular

   Existing MemberRecords are NOT overwritten — once a tester has
   a record, they manage it themselves (via the dev set-tier
   endpoint, direct Redis edits, or real Stripe test mode). */

type DevGrantTier =
  | "founder"
  | "charter"
  | "regular"
  | "hunter"
  | "operator"
  | "apex";

function readDevGrantTier(): DevGrantTier {
  const raw = (process.env.DEV_AUTO_GRANT_TIER ?? "").toLowerCase().trim();
  if (
    raw === "founder" ||
    raw === "charter" ||
    raw === "hunter" ||
    raw === "operator" ||
    raw === "apex"
  ) {
    return raw;
  }
  return "regular";
}

function devGrantAmountCents(tier: DevGrantTier): number {
  switch (tier) {
    case "founder":
      return 800;
    case "charter":
      return 1300;
    case "hunter":
      return 2500;
    case "operator":
      return 5000;
    case "apex":
      return 10000;
    case "regular":
      return 1300;
  }
}

export async function ensureDevMemberRecord(email: string): Promise<void> {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.DEV_AUTO_GRANT !== "1"
  ) {
    return;
  }
  const normalised = email.toLowerCase().trim();
  if (!normalised) return;

  const existing = await getMember(normalised);
  if (existing) return;

  const tier = readDevGrantTier();
  const amountCents = devGrantAmountCents(tier);

  // Founder + Charter slots are real — claiming one consumes a slot
  // from the dev Redis instance. Skip claim if not requesting one.
  let founderSlot: number | null = null;
  let charterSlot: number | null = null;
  let recordTier: Tier = "regular";
  if (tier === "founder") {
    const slot = await claimFounderSlot();
    if (slot !== null) {
      founderSlot = slot;
      recordTier = "founder";
    }
  } else if (tier === "charter") {
    const slot = await claimCharterSlot();
    if (slot !== null) {
      charterSlot = slot;
      recordTier = "charter";
    }
  }

  const now = Date.now();
  await saveMember({
    email: normalised,
    stripeCustomerId: `dev_${normalised}`,
    stripeSubscriptionId: `dev_sub_${normalised}`,
    tier: recordTier,
    founderSlot,
    charterSlot,
    status: "active",
    interval: "month",
    amountCents,
    createdAt: now,
    updatedAt: now,
    customAvatarUrl: null,
  });
}

/* === Checkout session ====================================== */

export type CheckoutError =
  | "stripe_not_configured"
  | "invalid_amount"
  | "below_floor"
  | "above_max"
  | "no_url_returned";

/**
 * Create a Stripe Checkout Session for a membership purchase. Uses
 * dynamic price_data so PWYW amounts don't require pre-provisioned
 * Price IDs. The price is created ad-hoc under a single Product
 * (STRIPE_MEMBERSHIP_PRODUCT_ID), or under an inline product_data
 * fallback when that env var isn't set.
 *
 * The tier surfaced to the buyer is best-effort (the page reads
 * isFounderEligible at render and the API re-checks here); the webhook
 * is the authority that atomically claims the slot.
 */
export async function createMembershipCheckoutSession(args: {
  plan: MembershipPlan;
  amountCents: number;
  email?: string;
}): Promise<{ url: string } | { error: CheckoutError; floor?: number }> {
  const stripe = client();
  if (!stripe) return { error: "stripe_not_configured" };

  if (
    typeof args.amountCents !== "number" ||
    !Number.isFinite(args.amountCents) ||
    args.amountCents <= 0
  ) {
    return { error: "invalid_amount" };
  }

  const founderEligible = await isFounderEligible();
  const floor = floorCentsFor(args.plan, founderEligible);
  // Charter only matters after Founder fills. The webhook re-checks
  // atomically; this is just the buyer-side hint so the success page
  // can show the right welcome.
  const charterEligible = !founderEligible && (await isCharterEligible());
  const tierAtCheckout: Tier = founderEligible
    ? "founder"
    : charterEligible
      ? "charter"
      : "regular";

  if (args.amountCents < floor) {
    return { error: "below_floor", floor };
  }
  if (args.amountCents > MAX_AMOUNT_CENTS) {
    return { error: "above_max" };
  }

  const productId = process.env.STRIPE_MEMBERSHIP_PRODUCT_ID;
  if (!productId && process.env.NODE_ENV === "production") {
    // Refuse the inline product_data fallback in prod: each checkout would
    // mint a fresh orphan Product, breaking Stripe reporting + lifecycle
    // visibility. Surface this loudly so ops can set the env var.
    console.error(
      "[membership] STRIPE_MEMBERSHIP_PRODUCT_ID is not set in production; refusing checkout."
    );
    return { error: "stripe_not_configured" };
  }
  const productRef = productId
    ? { product: productId }
    : { product_data: { name: "Stop Being Prey Membership" } };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: args.amountCents,
          recurring: {
            interval: args.plan === "monthly" ? "month" : "year",
          },
          ...productRef,
        },
      },
    ],
    customer_email: args.email,
    allow_promotion_codes: true,
    success_url: `${baseUrl()}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl()}/membership`,
    metadata: {
      lane: "membership",
      tier_at_checkout: tierAtCheckout,
      plan: args.plan,
      amount_cents: String(args.amountCents),
    },
    subscription_data: {
      metadata: {
        lane: "membership",
        tier_at_checkout: tierAtCheckout,
        plan: args.plan,
      },
    },
  });

  if (!session.url) return { error: "no_url_returned" };
  return { url: session.url };
}

/**
 * Pull the email + customer id + checkout metadata off a completed
 * Checkout Session. Used by /membership/success to issue the welcome
 * magic link and to detect the "intended founder, got Regular"
 * outcome when the slot race lost.
 */
export async function getCheckoutSessionInfo(sessionId: string): Promise<{
  email: string | null;
  customerId: string | null;
  metadata: Record<string, string>;
} | null> {
  const stripe = client();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const email =
      session.customer_details?.email ?? session.customer_email ?? null;
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;
    const metadata: Record<string, string> = {};
    for (const [k, v] of Object.entries(session.metadata ?? {})) {
      if (typeof v === "string") metadata[k] = v;
    }
    return { email, customerId, metadata };
  } catch {
    return null;
  }
}

/**
 * Create a Stripe Customer Portal session and return the URL. The
 * portal handles cancel, update card, billing history.
 */
export async function createCustomerPortalSession(
  customerId: string
): Promise<{ url: string } | { error: string }> {
  const stripe = client();
  if (!stripe) return { error: "stripe_not_configured" };
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl()}/membership/account`,
  });
  return { url: portal.url };
}

/**
 * Internal: expose the Stripe client to neighbour modules (webhook
 * needs it for subscription retrieve). Returns null if unconfigured.
 */
export function getStripeClient(): Stripe | null {
  return client();
}

/* === Case review one-time payment ========================== */

/**
 * Create a Stripe Checkout Session for a one-time Case Review
 * purchase ($25 Public or $50 Private). Uses ad-hoc price_data so we
 * don't need pre-provisioned Stripe Products. The case_id metadata
 * is the load-bearing link between the webhook event and the
 * pre-written submission record.
 *
 * The webhook is authoritative on the paid state: this route writes
 * the submission as `submitted`, returns the URL, and lets the
 * webhook flip the record to `paid` + send the emails.
 */
export async function createCaseReviewCheckoutSession(args: {
  caseId: string;
  tier: "public_review" | "private_review";
  amountCents: number;
  memberEmail: string;
  caseTitle: string;
}): Promise<
  { url: string; sessionId: string } | { error: CheckoutError }
> {
  const stripe = client();
  if (!stripe) return { error: "stripe_not_configured" };

  if (
    typeof args.amountCents !== "number" ||
    !Number.isFinite(args.amountCents) ||
    args.amountCents <= 0
  ) {
    return { error: "invalid_amount" };
  }

  const productName =
    args.tier === "public_review"
      ? "Case Review - Public"
      : "Case Review - Private";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: args.amountCents,
          product_data: {
            name: productName,
            description: args.caseTitle.slice(0, 200),
          },
        },
      },
    ],
    customer_email: args.memberEmail,
    success_url: `${baseUrl()}/case-files/submitted?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl()}/case-files`,
    metadata: {
      lane: "case_review",
      case_id: args.caseId,
      tier: args.tier,
      member_email: args.memberEmail,
    },
    payment_intent_data: {
      metadata: {
        lane: "case_review",
        case_id: args.caseId,
        tier: args.tier,
      },
    },
  });

  if (!session.url) return { error: "no_url_returned" };
  return { url: session.url, sessionId: session.id };
}

/* === Paid (non-member) comment one-time payment ============== */

/**
 * $1 one-time Stripe Checkout for a non-member paid comment. The
 * comment draft is pre-written via paid-comments.createPaidCommentDraft
 * before this is called; we bind the session id back to the draft via
 * attachPaidCommentCheckout once we have it. Webhook lane
 * `paid_comment` does the final flip-to-paid + index insertion.
 */
export async function createPaidCommentCheckoutSession(args: {
  commentId: string;
  amountCents: number;
  email: string;
  pieceKind: "article" | "note" | "case-file";
  pieceSlug: string;
  pieceTitle: string;
}): Promise<{ url: string; sessionId: string } | { error: CheckoutError }> {
  const stripe = client();
  if (!stripe) return { error: "stripe_not_configured" };

  if (
    typeof args.amountCents !== "number" ||
    !Number.isFinite(args.amountCents) ||
    args.amountCents <= 0
  ) {
    return { error: "invalid_amount" };
  }

  const productName = `Comment on "${args.pieceTitle.slice(0, 80)}"`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: args.amountCents,
          product_data: {
            name: productName,
            description:
              "One-time contribution to leave a comment on Stop Being Prey.",
          },
        },
      },
    ],
    customer_email: args.email,
    success_url: `${baseUrl()}/comments/paid/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl()}/${
      args.pieceKind === "article"
        ? args.pieceSlug
        : `notes/field-notes/${args.pieceSlug}`
    }`,
    metadata: {
      lane: "paid_comment",
      comment_id: args.commentId,
      piece_kind: args.pieceKind,
      piece_slug: args.pieceSlug,
    },
    payment_intent_data: {
      metadata: {
        lane: "paid_comment",
        comment_id: args.commentId,
      },
    },
  });

  if (!session.url) return { error: "no_url_returned" };
  return { url: session.url, sessionId: session.id };
}
