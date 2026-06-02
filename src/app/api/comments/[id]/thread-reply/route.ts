import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  createThreadReply,
  getProfile,
  isAdmin,
  notifyOnReply,
} from "@/lib/comments";
import { createNotification } from "@/lib/notifications";
import { parseMentions, resolveMentionToEmail } from "@/lib/mentions";
import { sendCommentThreadReplyNotification } from "@/lib/email";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { getAllCaseFiles } from "@/lib/case-files";
import { baseUrl } from "@/lib/membership";

// POST /api/comments/:id/thread-reply  body: { body }
// Member-to-member reply. Auto-approve. The reply's displayName is
// pulled from the caller's stored profile so it matches how they
// appear elsewhere on the site (and so a sloppy client can't spoof a
// different name).
//
// On success, fires an in-site notification + optional email to the
// parent comment's author (unless they're the same person — no
// self-notification). Email is gated by their notifyOnReply pref so
// the toggle that mutes Clay's replies also mutes member replies.

export const runtime = "nodejs";

type PieceMeta = { title: string; path: string; absoluteUrl: string };

function pieceMeta(
  kind: "article" | "note" | "case-file",
  slug: string,
  commentId: string
): PieceMeta {
  let path: string;
  let title = slug;
  if (kind === "article") {
    path = `/${slug}#c-${commentId}`;
    title = getAllArticles().find((x) => x.slug === slug)?.title ?? slug;
  } else if (kind === "case-file") {
    path = `/case-files/${slug}#c-${commentId}`;
    title = getAllCaseFiles().find((x) => x.slug === slug)?.title ?? slug;
  } else {
    path = `/notes/field-notes/${slug}#c-${commentId}`;
    title = getAllFieldNotes().find((x) => x.slug === slug)?.title ?? slug;
  }
  return { title, path, absoluteUrl: `${baseUrl()}${path}` };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = (payload as { body?: unknown })?.body;
  if (typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "empty_body" }, { status: 400 });
  }

  // Admin (Clay) posts thread replies under the "Clay" author name even
  // though he has no member profile — same fallback the lounge uses. A
  // regular member still needs a display name on file (the picker / form
  // is gated on it, but guard the API too).
  const viewerIsAdmin = isAdmin(session.email);
  const profile = await getProfile(session.email);
  const displayName = viewerIsAdmin
    ? profile?.displayName?.trim() || "Clay"
    : profile?.displayName;
  if (!displayName) {
    return NextResponse.json(
      { error: "display_name_required" },
      { status: 400 }
    );
  }

  const result = await createThreadReply({
    parentId: id,
    email: session.email,
    displayName,
    body,
  });
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "thread_full"
          ? 409
          : result.error === "empty_body"
            ? 400
            : 503;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Notify the parent author. Skip when the replier IS the parent
  // author (replying to your own comment shouldn't ping yourself) or
  // when the parent author is admin (Clay's mailbox doesn't need this
  // — admin moderation/queue already covers it).
  const parent = result.comment;
  const replierNormalized = session.email.toLowerCase().trim();
  const piece = pieceMeta(parent.kind, parent.slug, parent.id);
  const parentGetsReplyPing = !!parent.email && parent.email !== replierNormalized;
  if (parentGetsReplyPing) {
    const parentProfile = await getProfile(parent.email).catch(() => null);

    await createNotification({
      memberEmail: parent.email,
      type: "comment_thread_reply",
      title: `${displayName} replied to your comment`,
      body: result.reply.body.slice(0, 120),
      linkUrl: piece.path,
    }).catch((err) => {
      console.error(
        `[notifications] thread reply write failed for ${parent.email}:`,
        err
      );
    });

    if (notifyOnReply(parentProfile)) {
      await sendCommentThreadReplyNotification({
        to: parent.email,
        recipientDisplayName:
          parent.displayName || parent.email.split("@")[0] || "Hey",
        replyAuthorDisplayName: displayName,
        pieceTitle: piece.title,
        pieceUrl: piece.absoluteUrl,
        replyBody: result.reply.body,
      }).catch((err) => {
        console.error(
          `[email] thread reply send threw for ${parent.email}:`,
          err
        );
      });
    }
  }

  // Fan out comment_mention notifications to anyone @-tagged in the
  // reply. Mirrors the lounge: self-mentions are skipped, and the
  // parent author isn't double-tapped when they're already getting the
  // thread-reply ping above. Fire-and-forget so the slow first-word
  // resolution scan (resolveMentionToEmail) doesn't delay the response.
  void (async () => {
    try {
      const tokens = parseMentions(result.reply.body);
      if (tokens.length === 0) return;
      const excerpt = result.reply.body.slice(0, 120);
      const notified = new Set<string>();
      for (const token of tokens) {
        const targetRaw = await resolveMentionToEmail(token);
        if (!targetRaw) continue;
        const target = targetRaw.toLowerCase().trim();
        if (target === replierNormalized) continue;
        if (parentGetsReplyPing && target === parent.email) continue;
        if (notified.has(target)) continue;
        notified.add(target);
        await createNotification({
          memberEmail: target,
          type: "comment_mention",
          title: `${displayName} mentioned you in a comment`,
          body: excerpt,
          linkUrl: piece.path,
        });
      }
    } catch (err) {
      console.error(`[notifications] comment_mention write failed:`, err);
    }
  })();

  return NextResponse.json({ ok: true, reply: result.reply });
}
