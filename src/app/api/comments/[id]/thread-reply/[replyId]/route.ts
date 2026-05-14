import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { deleteThreadReply, editThreadReply } from "@/lib/comments";

// DELETE /api/comments/:id/thread-reply/:replyId
// PATCH  /api/comments/:id/thread-reply/:replyId  body: { body }
// Author-or-admin delete; author-only edit inside the 5-minute window.

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; replyId: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { id, replyId } = await params;
  if (!id || !replyId) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const result = await deleteThreadReply(id, replyId, session.email);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; replyId: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { id, replyId } = await params;
  if (!id || !replyId) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = (payload as { body?: unknown })?.body;
  if (typeof body !== "string") {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }

  const result = await editThreadReply(id, replyId, session.email, body);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : result.error === "edit_window_expired"
            ? 410
            : result.error === "empty_body"
              ? 400
              : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, reply: result.reply });
}
