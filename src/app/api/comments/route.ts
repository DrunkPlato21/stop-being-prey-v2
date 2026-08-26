import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  createComment,
  getProfile,
  isApproved,
  setProfile,
  type CommentKind,
} from "@/lib/comments";
import { createNotification } from "@/lib/notifications";
import { parseMentions, resolveMentionToEmail } from "@/lib/mentions";
import { sendPendingCommentNotification } from "@/lib/email";
import { resolveCommentPiece } from "@/lib/comment-piece";
import { baseUrl } from "@/lib/membership";

// POST /api/comments
// Body: { kind: "article" | "note" | "case-file", slug: string,
//         body: string, displayName?: string }
// Auth: requires a valid member session.
//
// If the member has no display name on file yet, `displayName` is
// required and gets persisted as their profile. On subsequent comments
// the stored profile name is used and any displayName in the body is
// ignored.

const MAX_BODY_LENGTH = 4000; // raw input cap before sanitize trim

function isCommentKind(value: unknown): value is CommentKind {
  return value === "article" || value === "note" || value === "case-file";
}

function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length < 200 &&
    /^[a-z0-9-]+$/.test(value)
  );
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const body = (payload as Record<string, unknown>).body;
  const kind = (payload as Record<string, unknown>).kind;
  const slug = (payload as Record<string, unknown>).slug;
  const submittedName = (payload as Record<string, unknown>).displayName;

  if (
    typeof body !== "string" ||
    body.length === 0 ||
    body.length > MAX_BODY_LENGTH
  ) {
    return NextResponse.json({ error: "invalid_body_field" }, { status: 400 });
  }
  if (!isCommentKind(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (!isSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  // Resolve display name. If the member has a profile with a name,
  // use it. Otherwise the submitted name is required and becomes
  // their profile (after the reserved/profanity/uniqueness checks).
  let profile = await getProfile(session.email);
  if (!profile?.displayName) {
    if (typeof submittedName !== "string" || submittedName.trim().length === 0) {
      return NextResponse.json(
        { error: "display_name_required" },
        { status: 400 }
      );
    }
    const result = await setProfile(session.email, submittedName);
    if (!result.ok) {
      const status =
        result.error === "name_taken"
          ? 409
          : result.error === "storage_unavailable"
            ? 503
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    profile = result.profile;
  }

  const result = await createComment({
    email: session.email,
    displayName: profile.displayName,
    kind,
    slug,
    body,
  });

  if (!result.ok) {
    const status =
      result.error === "already_commented"
        ? 409
        : result.error === "storage_unavailable"
          ? 503
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Resolve the piece once: the admin email, and the mention fan-out
  // below, both need the title and the link. resolveCommentPiece is the
  // only thing that gets an Arena bout right — a bout mounts the
  // comments sheet as kind "case-file" with the bout's uuid for a slug,
  // so the old inline lookups missed, titled the row with a uuid, and
  // linked to /case-files/<uuid>, which 404s.
  const piece = await resolveCommentPiece(
    result.comment.kind,
    result.comment.slug,
    result.comment.id
  );

  // Notify the admin (Clay) so a comment doesn't sit unseen until he
  // happens to open /admin/comments. This used to be gated on the
  // comment being unapproved, back when member comments landed in a
  // pre-publish hold. createComment now auto-approves every member
  // comment, which made the condition permanently false and silently
  // killed the only push signal Clay had. The email's job was never
  // "flag a queue item" — it is "tell him someone spoke".
  const adminEmail = process.env.ADMIN_EMAIL;
  const authorIsAdmin =
    !!adminEmail &&
    result.comment.email === adminEmail.toLowerCase().trim();
  if (adminEmail && !authorIsAdmin) {
    const sendResult = await sendPendingCommentNotification({
      to: adminEmail,
      authorDisplayName: result.comment.displayName,
      authorEmail: result.comment.email,
      pieceTitle: piece.title,
      pieceUrl: piece.absoluteUrl,
      queueUrl: `${baseUrl()}/admin/comments`,
      body: result.comment.body,
    });
    if (!sendResult.ok) {
      console.warn(
        `[comment] Admin notification failed for ${result.comment.id}: ${sendResult.error}`
      );
    }
  }

  // Fan out comment_mention notifications to anyone @-tagged in the
  // body — but only when the comment is already live. Public-article
  // comments sit in the pending queue, so pinging a mentioned member at
  // a link they can't see yet would be wrong; auto-approved surfaces
  // (member-only Field Notes / case files, admin) notify immediately.
  // The thread-reply path is where most member-to-member tagging
  // happens and notifies regardless. Fire-and-forget so the first-word
  // resolution scan doesn't delay the response.
  if (isApproved(result.comment)) {
    const comment = result.comment;
    const authorNormalized = session.email.toLowerCase().trim();
    void (async () => {
      try {
        const tokens = parseMentions(comment.body);
        if (tokens.length === 0) return;
        const path = piece.path;
        const excerpt = comment.body.slice(0, 120);
        const notified = new Set<string>();
        for (const token of tokens) {
          const targetRaw = await resolveMentionToEmail(token);
          if (!targetRaw) continue;
          const target = targetRaw.toLowerCase().trim();
          if (target === authorNormalized) continue;
          if (notified.has(target)) continue;
          notified.add(target);
          await createNotification({
            memberEmail: target,
            type: "comment_mention",
            title: `${comment.displayName} mentioned you in a comment`,
            body: excerpt,
            linkUrl: path,
          });
        }
      } catch (err) {
        console.error(`[notifications] comment_mention write failed:`, err);
      }
    })();
  }

  return NextResponse.json({ comment: result.comment });
}
