import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  isNotificationsConfigured,
  markAllRead,
} from "@/lib/notifications";

// POST /api/notifications/mark-all-read
// Flips every unread notification on the caller to read.

export const runtime = "nodejs";

export async function POST() {
  if (!isNotificationsConfigured()) {
    return Response.json({ ok: true, flipped: 0 });
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }
  const flipped = await markAllRead(session.email);
  return Response.json({ ok: true, flipped });
}
