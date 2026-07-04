import type { NextRequest } from "next/server";
import { getMember } from "@/lib/members";
import {
  createReactivationCheckoutSession,
  emailHasActiveMembership,
  hasRecoverableSubscription,
} from "@/lib/membership";
import { isAdmin } from "@/lib/comments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/reactivate
// Body: { email: string }
// Returns: { url } to Stripe Checkout, or { state } where state is:
//   "not_found"       -> no member record for this email
//   "already_active"  -> they already have a live membership; just sign in
//   "no_subscription" -> a gift/pool seat, no Stripe subscription to revive
//
// Self-serve reactivation for a lapsed member: rebills their LOCKED price
// on their EXISTING Stripe customer, preserving their founder slot (the
// webhook honors reactivation:true). Replaces hand-building a subscription
// in the Stripe dashboard.

const IP_LIMIT = 10;
const WINDOW_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawEmail = (body as { email?: unknown })?.email;
  if (typeof rawEmail !== "string") {
    return Response.json({ error: "missing_email" }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();
  if (email.length === 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:reactivate:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  // The author isn't a paying member; nothing to reactivate.
  if (isAdmin(email)) {
    return Response.json({ state: "not_found" });
  }

  const member = await getMember(email).catch(() => null);
  if (!member) {
    return Response.json({ state: "not_found" });
  }

  // Already has a live way in: don't start a second subscription.
  const active = await emailHasActiveMembership(email).catch(() => ({
    active: false,
    customerId: null,
  }));
  if (active.active) {
    return Response.json({ state: "already_active" });
  }

  // Only real Stripe-subscription members can reactivate. Gift/pool seats
  // (synthetic customer ids) have no subscription to revive.
  if (!member.stripeCustomerId.startsWith("cus_")) {
    return Response.json({ state: "no_subscription" });
  }

  // Not fully canceled yet (past_due / unpaid / incomplete): a new card on
  // the EXISTING sub fixes it. Starting a second subscription here would
  // double-bill, so send them to update their card instead.
  if (await hasRecoverableSubscription(member.stripeCustomerId)) {
    return Response.json({ state: "update_card" });
  }

  const amountCents = member.amountCents;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return Response.json({ state: "no_subscription" });
  }
  const plan = member.interval === "year" ? "yearly" : "monthly";

  const result = await createReactivationCheckoutSession({
    customerId: member.stripeCustomerId,
    amountCents,
    plan,
  });
  if ("error" in result) {
    const status =
      result.error === "stripe_not_configured" ||
      result.error === "no_url_returned"
        ? 500
        : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ url: result.url });
}
