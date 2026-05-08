import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  getProfile,
  isAdmin,
  isApproved,
  isCommentsConfigured,
  listCommentsForSlug,
  type CommentKind,
  type CommentRecord,
} from "@/lib/comments";
import { CommentForm } from "@/components/CommentForm";
import { CommentItem } from "@/components/CommentItem";

// Comments section. Server component — fetches data on every request.
// Renders the list, then either the comment form (signed-in members),
// the "you've already commented" state (members who posted), or the
// sign-in / join CTA (anonymous visitors on public articles).
//
// Field-note pages are gated by /proxy.ts so visitors are always
// authenticated by the time we render here. Article pages are public,
// so we render to anyone but gate the form behind a session.

type Props = {
  kind: CommentKind;
  slug: string;
};

export async function Comments({ kind, slug }: Props) {
  if (!isCommentsConfigured()) {
    // No Redis → render nothing rather than a broken section.
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const profile = session ? await getProfile(session.email) : null;
  const allComments = await listCommentsForSlug(kind, slug);

  const viewerEmail = session ? session.email.toLowerCase().trim() : null;
  const viewerIsAdmin = session ? isAdmin(session.email) : false;

  // Visibility filter for pre-publish hold:
  //  - approved comments are visible to everyone
  //  - pending comments are visible to (a) their author and (b) admin
  const comments = allComments.filter((c) => {
    if (isApproved(c)) return true;
    if (viewerIsAdmin) return true;
    if (viewerEmail && viewerEmail === c.email) return true;
    return false;
  });

  // "You've already commented" check uses the unfiltered list — a
  // pending comment still locks out a second post.
  const myComment: CommentRecord | null = viewerEmail
    ? allComments.find((c) => c.email === viewerEmail) ?? null
    : null;

  return (
    <section className="max-w-2xl mx-auto px-6 mt-16">
      <div className="text-center mb-10">
        <p className="eyebrow">Comments</p>
      </div>

      {comments.length === 0 ? (
        <p
          className="font-serif italic text-ink-muted text-center leading-relaxed"
          style={{ fontSize: "1rem" }}
        >
          No comments yet. Be the first.
        </p>
      ) : (
        <ul className="flex flex-col">
          {comments.map((c, idx) => (
            <li
              key={c.id}
              className={
                idx === 0 ? "py-6" : "py-6 border-t border-rule"
              }
            >
              <CommentItem
                comment={c}
                viewerEmail={session?.email ?? null}
                viewerIsAdmin={viewerIsAdmin}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Form / CTA */}
      <div className="mt-10 pt-10 border-t border-rule">
        {session ? (
          myComment ? (
            <p
              className="font-serif italic text-ink-muted text-center leading-relaxed"
              style={{ fontSize: "0.98rem" }}
            >
              You&apos;ve added your comment. Delete it above to post a
              different one.
            </p>
          ) : (
            <CommentForm
              kind={kind}
              slug={slug}
              hasProfile={!!profile?.displayName}
              existingDisplayName={profile?.displayName || null}
            />
          )
        ) : (
          <div className="text-center">
            <p
              className="font-serif italic text-ink-muted leading-relaxed mb-4"
              style={{ fontSize: "0.98rem" }}
            >
              Members can join the conversation.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <Link
                href="/membership"
                className="font-display text-xs uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontWeight: 600 }}
              >
                Join &rarr;
              </Link>
              <Link
                href="/notes/sign-in"
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
