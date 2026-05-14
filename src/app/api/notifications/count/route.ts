import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  isNotificationsConfigured,
  unreadCount,
} from "@/lib/notifications";

// GET /api/notifications/count
// Returns { ok: true, count: <unread count> } for the bell badge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isNotificationsConfigured()) {
    return Response.json({ ok: true, count: 0 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ ok: true, count: 0 });
  }
  const count = await unreadCount(session.email);
  return Response.json(
    { ok: true, count },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
