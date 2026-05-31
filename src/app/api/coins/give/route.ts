import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile } from "@/lib/comments";
import { giveCoin } from "@/lib/coins";
import { createNotification } from "@/lib/notifications";

// POST /api/coins/give   body: { commentId: string }
//
// Gives the caller's one coin for this piece to a top-level comment.
// Session-gated (non-members can't give). Self-coin, reply-coin, and
// double-spend are all rejected by giveCoin(); this route just wires
// auth, resolves the giver's display name, and fires the recipient's
// in-site notification on success.

export const runtime = "nodejs";

function firstWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const space = trimmed.search(/\s/);
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function commentPath(
  kind: "article" | "note" | "case-file",
  slug: string,
  commentId: string
): string {
  if (kind === "article") return `/${slug}#c-${commentId}`;
  if (kind === "case-file") return `/case-files/${slug}#c-${commentId}`;
  return `/notes/field-notes/${slug}#c-${commentId}`;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const commentId = (payload as { commentId?: unknown })?.commentId;
  if (typeof commentId !== "string" || commentId.length === 0) {
    return NextResponse.json({ error: "invalid_comment_id" }, { status: 400 });
  }

  const profile = await getProfile(session.email);
  const giverDisplayName =
    profile?.displayName?.trim() ||
    session.email.split("@")[0] ||
    "A member";

  const result = await giveCoin({
    giverEmail: session.email,
    giverDisplayName,
    commentId,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "self_coin"
          ? 403
          : result.error === "already_spent"
            ? 409
            : 503;
    return NextResponse.json(
      { error: result.error, spentOn: result.spentOn },
      { status }
    );
  }

  // Recognition: notify the recipient. Best-effort — the coin is already
  // committed; a notification miss is a degraded outcome, not a failure.
  // (Email notifications are intentionally out of scope for v1; this
  // route is the single seam where they'd be added later.)
  const recipient = result.recipientEmail;
  const giverFirst = firstWord(giverDisplayName) || "A member";
  if (recipient && recipient !== session.email.toLowerCase().trim()) {
    await createNotification({
      memberEmail: recipient,
      type: "coin_received",
      title: `${giverFirst} gave your comment a coin`,
      body: result.comment.body.slice(0, 120),
      linkUrl: commentPath(
        result.comment.kind,
        result.comment.slug,
        result.comment.id
      ),
    }).catch((err) => {
      console.error(`[coins] notification failed for ${recipient}:`, err);
    });
  }

  return NextResponse.json({ ok: true, count: result.count });
}
