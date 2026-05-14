import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  isNotificationsConfigured,
  listForMember,
} from "@/lib/notifications";

// GET /api/notifications?limit=10&before=<createdAt>
// Returns the current member's recent notifications, newest first.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isNotificationsConfigured()) {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  const url = req.nextUrl;
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 10;
  const rawBefore = url.searchParams.get("before");
  const before = rawBefore ? Number.parseInt(rawBefore, 10) : undefined;

  const notifications = await listForMember(session.email, {
    limit: Number.isFinite(limit) ? limit : 10,
    before:
      typeof before === "number" && Number.isFinite(before) ? before : undefined,
  });

  return Response.json(
    { ok: true, notifications },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
