import Stripe from "stripe";

// Stripe-side helpers for membership. Customer lookup by email, active
// subscription check, checkout session creation, customer portal URL.

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

export function priceIdFor(plan: MembershipPlan): string | undefined {
  return plan === "monthly"
    ? process.env.STRIPE_MEMBERSHIP_MONTHLY_PRICE_ID
    : process.env.STRIPE_MEMBERSHIP_YEARLY_PRICE_ID;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

/**
 * Find a Stripe Customer by email. Stripe allows multiple customers
 * with the same email, so we take the most recently created one (which
 * is the one most likely to hold the live subscription).
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
 * Counts both `active` and `trialing` statuses. Subscriptions still in
 * a trial or in their grace period are considered active. Subscriptions
 * with `cancel_at_period_end: true` remain active until period end and
 * we honor that.
 */
export async function emailHasActiveMembership(
  email: string
): Promise<{ active: boolean; customerId: string | null }> {
  // Dev-only bypass: when DEV_AUTO_GRANT=1 in a non-production env,
  // treat any email as an active member. Lets us exercise the magic
  // link + session flow without a real Stripe subscription. Cannot
  // fire in production (the env-mode check is short-circuited).
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

/**
 * Create a Stripe Checkout Session for a recurring membership purchase.
 * Returns the hosted Stripe URL or an error string.
 */
export async function createMembershipCheckoutSession(args: {
  plan: MembershipPlan;
  email?: string;
}): Promise<{ url: string } | { error: string }> {
  const stripe = client();
  if (!stripe) return { error: "stripe_not_configured" };
  const price = priceIdFor(args.plan);
  if (!price) {
    return {
      error:
        args.plan === "monthly"
          ? "STRIPE_MEMBERSHIP_MONTHLY_PRICE_ID is not set"
          : "STRIPE_MEMBERSHIP_YEARLY_PRICE_ID is not set",
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price, quantity: 1 }],
    customer_email: args.email,
    allow_promotion_codes: true,
    success_url: `${baseUrl()}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl()}/membership`,
    subscription_data: {
      metadata: { plan: args.plan },
    },
  });

  if (!session.url) return { error: "no_url_returned" };
  return { url: session.url };
}

/**
 * Pull the email + customer id off a completed Checkout Session. Used
 * by /membership/success to issue the welcome magic link.
 */
export async function getCheckoutSessionInfo(
  sessionId: string
): Promise<{ email: string | null; customerId: string | null } | null> {
  const stripe = client();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id ?? null;
    return { email, customerId };
  } catch {
    return null;
  }
}

/**
 * Create a Stripe Customer Portal session and return the URL. The
 * portal handles cancel, update card, billing history. Members reach
 * it from /membership/account.
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
