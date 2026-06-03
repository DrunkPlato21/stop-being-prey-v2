import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  isLoungeConfigured,
  memberDeletePost,
  memberDeleteReply,
} from "@/lib/lounge";

// POST /api/lounge/delete  body: { kind: "post" | "reply", id: string }
// Member-initiated delete of their OWN post or reply, allowed within
// the 15-minute edit window. Ownership + window are enforced in the
// lib; admin bypasses both. (Admin's own moderation delete of ANYONE's
// content still lives at /api/admin/lounge/delete.) The member's first
// name is recorded in the moderation log for the audit trail.

export const runtime = "nodejs";

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export async function POST(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
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
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind;
  const id = b.id;
  if ((kind !== "post" && kind !== "reply") || typeof id !== "string") {
    return Response.json({ error: "invalid_target" }, { status: 400 });
  }

  const profile = await getProfile(session.email).catch(() => null);
  const firstName =
    firstWord(
      profile?.displayName?.trim() || session.email.split("@")[0] || "Member"
    ) || "Member";
  const actor = {
    email: session.email,
    firstName,
    isAdmin: isAdmin(session.email),
  };

  const result =
    kind === "post"
      ? await memberDeletePost(id, actor)
      : await memberDeleteReply(id, actor);

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : result.error === "window_closed"
            ? 409
            : 503;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ ok: true });
}
