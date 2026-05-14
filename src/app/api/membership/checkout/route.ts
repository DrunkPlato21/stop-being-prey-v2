import type { NextRequest } from "next/server";
import {
  createMembershipCheckoutSession,
  type MembershipPlan,
} from "@/lib/membership";

// POST /api/membership/checkout
// Body: { plan: "monthly" | "yearly", amountCents: number, email?: string }
// Returns: { url } on success, { error, floor? } on validation failure.
//
// The floor is returned with a `below_floor` error so the client can
// show the user what the minimum is rather than guessing. The webhook
// is authoritative on tier; this route's tier check is only used to
// reject obviously-bad amounts before we hit Stripe.

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawPlan = (body as { plan?: unknown })?.plan;
  const rawAmount = (body as { amountCents?: unknown })?.amountCents;
  const rawEmail = (body as { email?: unknown })?.email;

  if (rawPlan !== "monthly" && rawPlan !== "yearly") {
    return Response.json({ error: "invalid_plan" }, { status: 400 });
  }
  const plan: MembershipPlan = rawPlan;

  if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount)) {
    return Response.json({ error: "invalid_amount" }, { status: 400 });
  }
  const amountCents = Math.round(rawAmount);

  const email =
    typeof rawEmail === "string" && rawEmail.trim().length > 0
      ? rawEmail.trim().toLowerCase()
      : undefined;

  const result = await createMembershipCheckoutSession({
    plan,
    amountCents,
    email,
  });
  if ("error" in result) {
    const status =
      result.error === "stripe_not_configured" || result.error === "no_url_returned"
        ? 500
        : 400;
    return Response.json(
      { error: result.error, floor: result.floor },
      { status }
    );
  }
  return Response.json({ url: result.url });
}
