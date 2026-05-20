import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  claimCharterSlot,
  claimFounderSlot,
  getMember,
  saveMember,
  type Tier,
} from "@/lib/members";

// Dev-only: rewrite the caller's MemberRecord to a different tier so
// badges can be exercised without going through Stripe test-mode
// checkout. Hard-gated behind NODE_ENV !== "production" AND
// DEV_AUTO_GRANT=1, so it cannot fire in prod even if the route is
// reachable.
//
//   POST /api/dev/set-tier
//   body: { tier: "founder" | "charter" | "regular" | "hunter" | "operator" | "apex" }
//
// Returns 404 in production / when the dev grant flag isn't set, so
// the endpoint reads as nonexistent to anyone but a developer who
// explicitly enabled it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DevTier =
  | "founder"
  | "charter"
  | "regular"
  | "hunter"
  | "operator"
  | "apex";

function isDevTier(v: unknown): v is DevTier {
  return (
    v === "founder" ||
    v === "charter" ||
    v === "regular" ||
    v === "hunter" ||
    v === "operator" ||
    v === "apex"
  );
}

function amountFor(tier: DevTier): number {
  switch (tier) {
    case "founder":
      return 800;
    case "charter":
      return 1300;
    case "regular":
      return 1300;
    case "hunter":
      return 2500;
    case "operator":
      return 5000;
    case "apex":
      return 10000;
  }
}

function devEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTO_GRANT === "1"
  );
}

export async function POST(req: NextRequest) {
  if (!devEnabled()) {
    return new Response("Not Found", { status: 404 });
  }

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawTier = (body as { tier?: unknown })?.tier;
  if (!isDevTier(rawTier)) {
    return Response.json({ error: "invalid_tier" }, { status: 400 });
  }

  const email = session.email.toLowerCase().trim();
  const existing = await getMember(email);
  const now = Date.now();

  // Founder / Charter slot handling: claim a slot if the caller asks
  // for that permanent tier and doesn't already hold one. If slots
  // are gone, return 409 rather than silently lying. Founder takes
  // precedence — an existing founder switching tier badges keeps
  // their founder status. Same for Charter.
  let recordTier: Tier = "regular";
  let founderSlot: number | null = existing?.founderSlot ?? null;
  let charterSlot: number | null = existing?.charterSlot ?? null;
  if (rawTier === "founder") {
    if (founderSlot !== null) {
      recordTier = "founder";
    } else {
      const slot = await claimFounderSlot();
      if (slot !== null) {
        founderSlot = slot;
        recordTier = "founder";
      } else {
        return Response.json(
          { error: "founder_cap_reached" },
          { status: 409 }
        );
      }
    }
  } else if (rawTier === "charter") {
    if (charterSlot !== null) {
      recordTier = "charter";
    } else {
      const slot = await claimCharterSlot();
      if (slot !== null) {
        charterSlot = slot;
        recordTier = "charter";
      } else {
        return Response.json(
          { error: "charter_cap_reached" },
          { status: 409 }
        );
      }
    }
  } else if (founderSlot !== null) {
    // Keep founder status even when switching tier badges.
    recordTier = "founder";
  } else if (charterSlot !== null) {
    // Same for charter.
    recordTier = "charter";
  }

  await saveMember({
    email,
    stripeCustomerId: existing?.stripeCustomerId ?? `dev_${email}`,
    stripeSubscriptionId:
      existing?.stripeSubscriptionId ?? `dev_sub_${email}`,
    tier: recordTier,
    founderSlot,
    charterSlot,
    status: "active",
    interval: "month",
    amountCents: amountFor(rawTier),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    customAvatarUrl: existing?.customAvatarUrl ?? null,
  });

  return Response.json({
    ok: true,
    tier: rawTier,
    amountCents: amountFor(rawTier),
    founderSlot,
    charterSlot,
  });
}
