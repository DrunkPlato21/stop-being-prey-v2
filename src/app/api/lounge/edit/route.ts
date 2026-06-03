import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { editPost, editReply, isLoungeConfigured } from "@/lib/lounge";

// POST /api/lounge/edit  body: { kind: "post" | "reply", id: string, body: string }
// Edit the caller's OWN post or reply. Ownership + the 15-minute edit
// window are enforced server-side in the lib; admin bypasses both.
// Editing only updates the body + stamps editedAt — it never re-floats
// the post or re-fires @-mention notifications (so an edit can't be
// used to spam pings).

export const runtime = "nodejs";

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
  const newBody = b.body;
  if ((kind !== "post" && kind !== "reply") || typeof id !== "string") {
    return Response.json({ error: "invalid_target" }, { status: 400 });
  }
  if (typeof newBody !== "string") {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }

  const actor = { email: session.email, isAdmin: isAdmin(session.email) };
  const result =
    kind === "post"
      ? await editPost(id, actor, newBody)
      : await editReply(id, actor, newBody);

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : result.error === "window_closed"
            ? 409
            : result.error === "storage_unavailable"
              ? 503
              : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ ok: true, body: result.body, editedAt: result.editedAt });
}
