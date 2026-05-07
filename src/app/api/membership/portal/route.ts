import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { createCustomerPortalSession } from "@/lib/membership";
import { SESSION_COOKIE } from "@/lib/auth";

// POST /api/membership/portal
// Reads the session cookie, identifies the Stripe customer, creates a
// Customer Portal session, returns the redirect URL.

function authSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function POST(req: NextRequest) {
  const secret = authSecret();
  if (!secret) {
    return Response.json({ error: "auth_not_configured" }, { status: 503 });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  let customerId: string | null = null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.customerId === "string") {
      customerId = payload.customerId;
    }
  } catch {
    return Response.json({ error: "invalid_session" }, { status: 401 });
  }

  if (!customerId) {
    return Response.json({ error: "no_customer_on_session" }, { status: 400 });
  }

  const result = await createCustomerPortalSession(customerId);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ url: result.url });
}
