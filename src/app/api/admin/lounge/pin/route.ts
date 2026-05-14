import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";
import { isLoungeConfigured, setPinned } from "@/lib/lounge";

// POST /api/admin/lounge/pin  body: { id: string | null }
// Pins a post by id, or unpins everything when id is null. Single
// pin slot — pinning a new post unpins the prior one. Basic-auth
// gated by proxy.ts.

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
  const rawId = (body as { id?: unknown })?.id;
  let postId: string | null;
  if (rawId === null) {
    postId = null;
  } else if (typeof rawId === "string" && rawId.length > 0) {
    postId = rawId;
  } else {
    return Response.json({ error: "invalid_id" }, { status: 400 });
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

  const result = await setPinned(postId, {
    email: actorEmail,
    firstName: actorFirstName,
  });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 503;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true, pinnedId: result.pinnedId });
}
