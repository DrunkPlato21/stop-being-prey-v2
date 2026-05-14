import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";
import {
  deletePost,
  deleteReply,
  isLoungeConfigured,
} from "@/lib/lounge";

// POST /api/admin/lounge/delete  body: { kind: "post"|"reply", id }
// Soft-deletes a post or reply. Basic-auth gated by proxy.ts. We
// also read the session cookie to record the admin's first name in
// the moderation log for posterity.

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

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  const actorEmail = session?.email ?? "admin";
  const profile = session?.email
    ? await getProfile(session.email).catch(() => null)
    : null;
  const actorFirstName = firstWord(
    profile?.displayName?.trim() ||
      (session?.email ? session.email.split("@")[0] : "Clay")
  ) || "Clay";

  const result =
    kind === "post"
      ? await deletePost(id, { email: actorEmail, firstName: actorFirstName })
      : await deleteReply(id, { email: actorEmail, firstName: actorFirstName });

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 503;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true });
}
