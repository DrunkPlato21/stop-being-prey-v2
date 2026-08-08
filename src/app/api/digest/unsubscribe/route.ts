import type { NextRequest } from "next/server";
import { verifyDigestToken } from "@/lib/auth";
import { setDigestUnsubscribed } from "@/lib/digest";

// RFC 8058 one-click unsubscribe endpoint for the weekly digest.
// Mail clients POST here from the List-Unsubscribe header with no
// user-visible page. The token is the only credential (no login by
// design, half the membership never signs in). Idempotent: repeat
// clicks are a no-op.
//
// GET redirects to the human page instead of mutating — some clients
// and link scanners prefetch header URLs, and a GET that unsubscribes
// would let a virus scanner silently unsubscribe half the list.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = await verifyDigestToken(token);
  if (!email) {
    return new Response("Invalid or expired link.", { status: 400 });
  }
  await setDigestUnsubscribed(email, true);
  return new Response("Unsubscribed from the weekly digest.", { status: 200 });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const url = new URL("/digest/unsubscribe", req.nextUrl.origin);
  if (token) url.searchParams.set("token", token);
  return Response.redirect(url.toString(), 302);
}
