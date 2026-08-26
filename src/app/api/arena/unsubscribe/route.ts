import type { NextRequest } from "next/server";
import { verifyArenaToken } from "@/lib/auth";
import { setArenaSubscribed } from "@/lib/arena-watch";

// RFC 8058 one-click unsubscribe for Arena email. Mail clients POST
// here from the List-Unsubscribe header with no user-visible page. The
// token is the only credential (no login by design, half the membership
// never signs in). Idempotent: repeat clicks are a no-op.
//
// GET redirects to the human page instead of mutating — some clients
// and link scanners prefetch header URLs, and a GET that unsubscribed
// would let a virus scanner silently empty the list.
//
// Lives at /arena-unsubscribe rather than /arena/unsubscribe on
// purpose: /arena/<slug> is the bout route, and a bout whose title
// slugified to "unsubscribe" would be shadowed by a static segment.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const email = await verifyArenaToken(token);
  if (!email) {
    return new Response("Invalid or expired link.", { status: 400 });
  }
  await setArenaSubscribed(email, false);
  return new Response("Unsubscribed from Arena email.", { status: 200 });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const url = new URL("/arena-unsubscribe", req.nextUrl.origin);
  if (token) url.searchParams.set("token", token);
  return Response.redirect(url.toString(), 302);
}
