import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  isAdmin,
  isCommentsConfigured,
  listPendingComments,
  type CommentRecord,
} from "@/lib/comments";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { ApproveCommentButton } from "@/components/ApproveCommentButton";
import { DeleteCommentButton } from "@/components/DeleteCommentButton";

export const metadata: Metadata = {
  title: "Comments queue",
  description: "Pending comments awaiting review.",
};

export const dynamic = "force-dynamic";

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pieceMeta(comment: CommentRecord): { title: string; url: string } {
  if (comment.kind === "article") {
    const a = getAllArticles().find((x) => x.slug === comment.slug);
    return {
      title: a?.title ?? comment.slug,
      url: `/${comment.slug}#c-${comment.id}`,
    };
  }
  const n = getAllFieldNotes().find((x) => x.slug === comment.slug);
  return {
    title: n?.title ?? comment.slug,
    url: `/notes/${comment.slug}#c-${comment.id}`,
  };
}

export default async function CommentsQueuePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // Gate: must be signed in AND be the admin. Anyone else gets sent
  // home rather than to a 404, so the surface stays quiet.
  if (!session || !isAdmin(session.email)) {
    redirect("/");
  }

  if (!isCommentsConfigured()) {
    return (
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-16 text-center">
        <p className="eyebrow mb-6">Comments queue</p>
        <p className="deck max-w-md mx-auto">
          Storage isn&apos;t configured. Set{" "}
          <code>UPSTASH_REDIS_REST_URL</code> and{" "}
          <code>UPSTASH_REDIS_REST_TOKEN</code>.
        </p>
      </section>
    );
  }

  const pending = await listPendingComments(200);

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6">Admin</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-3"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            Comments queue.
          </h1>
          <p className="deck max-w-xl mx-auto">
            {pending.length === 0
              ? "Nothing pending. The room is quiet."
              : pending.length === 1
                ? "1 comment awaiting review."
                : `${pending.length} comments awaiting review.`}
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        {pending.length === 0 ? null : (
          <ul className="flex flex-col">
            {pending.map((c, idx) => {
              const piece = pieceMeta(c);
              return (
                <li
                  key={c.id}
                  className={
                    idx === 0 ? "py-8" : "py-8 border-t border-rule"
                  }
                >
                  {/* Piece reference */}
                  <p className="eyebrow mb-3">
                    {c.kind === "article" ? "Essay" : "Field Note"}
                    {" · "}
                    <Link
                      href={piece.url}
                      className="text-ink-muted hover:text-eye-deep no-underline"
                    >
                      {piece.title}
                    </Link>
                  </p>

                  {/* Author + time */}
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                    <span
                      className="font-display text-ink"
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {c.displayName}
                    </span>
                    <span
                      className="font-serif italic text-ink-faint"
                      style={{ fontSize: "0.82rem" }}
                    >
                      {formatTimestamp(c.createdAt)} · {c.email}
                    </span>
                  </div>

                  {/* Body */}
                  <div
                    className="font-serif text-ink leading-relaxed whitespace-pre-line"
                    style={{ fontSize: "1.02rem" }}
                  >
                    {c.body}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex flex-wrap items-center gap-5">
                    <ApproveCommentButton id={c.id} />
                    <DeleteCommentButton id={c.id} />
                    <Link
                      href={piece.url}
                      className="font-display uppercase tracking-[0.2em] text-ink-muted hover:text-ink no-underline transition-colors"
                      style={{ fontSize: "0.7rem", fontWeight: 500 }}
                    >
                      Open in context &rarr;
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
