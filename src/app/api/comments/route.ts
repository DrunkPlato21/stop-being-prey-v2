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
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { getAllCaseFiles } from "@/lib/case-files";
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

function commentPath(
  kind: CommentKind,
  slug: string,
  id: string
): string {
  if (kind === "article") return `/${slug}#c-${id}`;
  if (kind === "case-file") return `/case-files/${slug}#c-${id}`;
  return `/notes/field-notes/${slug}#c-${id}`;
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

  // Notify the admin (Clay) so they don't need to poll the queue.
  // Only fires if ADMIN_EMAIL is configured — otherwise there's no
  // admin to notify and no queue UX to point them at anyway. Skipped
  // when the comment is already approved (Clay's own comments and
  // member comments on member-only Field Notes), since the email's
  // job is to flag a queue item and there's nothing to queue. Failure
  // doesn't fail the request: the comment is already persisted and
  // visible to the author via the pending-state badge.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && !isApproved(result.comment)) {
    const piece =
      result.comment.kind === "article"
        ? (() => {
            const a = getAllArticles().find(
              (x) => x.slug === result.comment.slug
            );
            return {
              title: a?.title ?? result.comment.slug,
              url: `${baseUrl()}/${result.comment.slug}#c-${result.comment.id}`,
            };
          })()
        : result.comment.kind === "case-file"
          ? (() => {
              const c = getAllCaseFiles().find(
                (x) => x.slug === result.comment.slug
              );
              return {
                title: c?.title ?? result.comment.slug,
                url: `${baseUrl()}/case-files/${result.comment.slug}#c-${result.comment.id}`,
              };
            })()
          : (() => {
              const n = getAllFieldNotes().find(
                (x) => x.slug === result.comment.slug
              );
              return {
                title: n?.title ?? result.comment.slug,
                url: `${baseUrl()}/notes/field-notes/${result.comment.slug}#c-${result.comment.id}`,
              };
            })();
    const sendResult = await sendPendingCommentNotification({
      to: adminEmail,
      authorDisplayName: result.comment.displayName,
      authorEmail: result.comment.email,
      pieceTitle: piece.title,
      pieceUrl: piece.url,
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
        const path = commentPath(comment.kind, comment.slug, comment.id);
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
