import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  isNotificationsConfigured,
  markRead,
} from "@/lib/notifications";

// POST /api/notifications/mark-read  body: { ids: string[] }
// Flips an explicit set of the caller's notifications to read.
// Idempotent — re-calling for already-read entries is a no-op.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isNotificationsConfigured()) {
    return Response.json({ ok: true, flipped: 0 });
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
  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids)) {
    return Response.json({ error: "invalid_ids" }, { status: 400 });
  }
  const filtered = ids.filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  const flipped = await markRead(session.email, filtered);
  return Response.json({ ok: true, flipped });
}
