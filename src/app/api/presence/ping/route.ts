import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { recordPresence } from "@/lib/presence";

// POST /api/presence/ping  { path: "/..." }
//
// Called by <PresenceBeacon /> from the root layout on every mount
// and route change. Records the member's current location so the
// admin presence panel can show "who's where right now."
//
// No-ops (and 200s) when:
//   - no session cookie (anonymous visitor)
//   - session belongs to admin (Clay shouldn't appear in his own panel)
//   - path is malformed, oversized, or an admin / api route

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PingBody = { path?: unknown };

function isSafePath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  if (!p.startsWith("/")) return false;
  if (p.length > 200) return false;
  if (p.startsWith("/admin")) return false;
  if (p.startsWith("/api/")) return false;
  return true;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  if (!session?.email) {
    return Response.json({ ok: true, skipped: "anon" });
  }
  if (isAdmin(session.email)) {
    return Response.json({ ok: true, skipped: "admin" });
  }
  let body: PingBody = {};
  try {
    body = (await req.json()) as PingBody;
  } catch {
    return Response.json({ ok: false, error: "bad_body" }, { status: 400 });
  }
  if (!isSafePath(body.path)) {
    return Response.json({ ok: false, error: "bad_path" }, { status: 400 });
  }
  await recordPresence(session.email, body.path, Date.now());
  return Response.json({ ok: true });
}
