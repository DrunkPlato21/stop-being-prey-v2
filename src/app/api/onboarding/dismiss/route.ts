import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { dismissOnboarding } from "@/lib/onboarding";

// POST /api/onboarding/dismiss — retire the new-member "Getting started"
// panel for the current member. Idempotent.

export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  await dismissOnboarding(session.email);
  return NextResponse.json({ ok: true });
}
