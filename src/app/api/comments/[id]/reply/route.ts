import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  setReply,
  deleteReply,
  isAdmin,
  getProfile,
  notifyOnReply,
} from "@/lib/comments";
import { sendReplyNotification } from "@/lib/email";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { getAllCaseFiles } from "@/lib/case-files";
import { baseUrl } from "@/lib/membership";

// POST /api/comments/:id/reply  — set or replace Clay's reply
// DELETE /api/comments/:id/reply — clear Clay's reply
// Both endpoints are admin-only (ADMIN_EMAIL match).
//
// On a successful POST we also email the comment author. Failure of
// the email send doesn't fail the request — the reply is already
// persisted; a missing notification is just a degraded outcome.

function lookupPiece(
  kind: "article" | "note" | "case-file",
  slug: string
): { title: string; url: string } {
  if (kind === "article") {
    const meta = getAllArticles().find((a) => a.slug === slug);
    return {
      title: meta?.title ?? slug,
      url: `${baseUrl()}/${slug}`,
    };
  }
  if (kind === "case-file") {
    const meta = getAllCaseFiles().find((c) => c.slug === slug);
    return {
      title: meta?.title ?? slug,
      url: `${baseUrl()}/case-files/${slug}`,
    };
  }
  const meta = getAllFieldNotes().find((n) => n.slug === slug);
  return {
    title: meta?.title ?? slug,
    url: `${baseUrl()}/notes/field-notes/${slug}`,
  };
}

const MAX_BODY_LENGTH = 8000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isAdmin(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const body = (payload as { body?: unknown } | null)?.body;
  if (
    typeof body !== "string" ||
    body.length === 0 ||
    body.length > MAX_BODY_LENGTH
  ) {
    return NextResponse.json({ error: "invalid_body_field" }, { status: 400 });
  }

  const result = await setReply(id, session.email, body);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : result.error === "storage_unavailable"
            ? 503
            : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Notify the comment author — but only if they haven't opted out.
  // Default-on for new and legacy profiles (notifyOnReply() handles
  // both cases). Send failure doesn't fail the request: the reply is
  // already persisted; a missing notification is a degraded outcome.
  const recipientProfile = await getProfile(result.comment.email);
  if (notifyOnReply(recipientProfile)) {
    const piece = lookupPiece(result.comment.kind, result.comment.slug);
    const sendResult = await sendReplyNotification({
      to: result.comment.email,
      recipientDisplayName: result.comment.displayName,
      pieceTitle: piece.title,
      pieceUrl: `${piece.url}#c-${result.comment.id}`,
      replyBody: result.comment.replyBody ?? body,
    });
    if (!sendResult.ok) {
      console.warn(
        `[reply] Notification email failed for comment ${result.comment.id}: ${sendResult.error}`
      );
    }
  }

  return NextResponse.json({ comment: result.comment });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isAdmin(session.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await deleteReply(id, session.email);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ comment: result.comment });
}
