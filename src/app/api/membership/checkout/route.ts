import type { NextRequest } from "next/server";
import {
  createMembershipCheckoutSession,
  type MembershipPlan,
} from "@/lib/membership";

// POST /api/membership/checkout
// Body: { plan: "monthly" | "yearly", email?: string }
// Returns: { url } pointing at the Stripe-hosted checkout page.

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawPlan = (body as { plan?: unknown })?.plan;
  const rawEmail = (body as { email?: unknown })?.email;

  if (rawPlan !== "monthly" && rawPlan !== "yearly") {
    return Response.json({ error: "invalid_plan" }, { status: 400 });
  }
  const plan: MembershipPlan = rawPlan;

  const email =
    typeof rawEmail === "string" && rawEmail.trim().length > 0
      ? rawEmail.trim().toLowerCase()
      : undefined;

  const result = await createMembershipCheckoutSession({ plan, email });
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return Response.json({ url: result.url });
}
