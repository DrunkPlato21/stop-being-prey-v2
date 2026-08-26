import Link from "next/link";
import type { Metadata } from "next";
import {
  isApproved,
  isCommentsConfigured,
  listRecentActivity,
  type CommentRecord,
} from "@/lib/comments";
import { commentPieceResolver } from "@/lib/comment-piece";
import { ApproveCommentButton } from "@/components/ApproveCommentButton";
import { DeleteCommentButton } from "@/components/DeleteCommentButton";
import { AdminReplyControls } from "@/components/AdminReplyControls";
import { BackfillCommentsIndexButton } from "@/components/BackfillCommentsIndexButton";
import { FeatureCommentButton } from "@/components/FeatureCommentButton";
import { getSectionSeen, markSectionSeen } from "@/lib/admin-nav-badges";

// Comment feed — every comment site-wide, ordered by most recent
// ACTIVITY rather than by when the comment was written, so a fresh
// reply floats its thread back to the top instead of sinking with a
// year-old parent.
//
// Two things this page used to get wrong, both of which made it
// untrustworthy as the place you go to find out what happened:
//
//   Replies were absent entirely. A thread reply only rewrites its
//   parent's record, so it never appeared here at all. Now every reply
//   is an event in comments:activity and renders under its parent.
//
//   Arena bout comments were unreadable. A bout mounts the comments
//   sheet as kind "case-file" with the bout's uuid for a slug, so the
//   old lookup missed, printed the uuid as the title, and linked to
//   /case-files/<uuid>, which 404s. commentPieceResolver knows about
//   bouts.
//
// Anything newer than your last visit carries a NEW mark; the seen
// stamp is read BEFORE it gets bumped so the marks describe the
// previous visit, not this one. Filters (status / piece / member) live
// in URL params and are applied in-memory after the index read; at
// launch volume this is fine. Gated by proxy.ts via HTTP Basic auth on
// /admin/*.

export const metadata: Metadata = {
  title: "Comments, admin",
  description: "All comments, newest first.",
};

export const dynamic = "force-dynamic";

const FEED_LIMIT = 200;

type StatusFilter = "all" | "pending" | "approved" | "featured";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "featured", label: "Featured" },
];

type Filters = {
  status: StatusFilter;
  piece: string | null;
  member: string | null;
};

function parseFilters(
  searchParams: Record<string, string | string[] | undefined>
): Filters {
  const status = (() => {
    const raw = searchParams.status;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === "pending" || v === "approved" || v === "featured" || v === "all") {
      return v;
    }
    return "all" as StatusFilter;
  })();
  const pieceRaw = searchParams.piece;
  const piece = Array.isArray(pieceRaw) ? pieceRaw[0] : pieceRaw;
  const memberRaw = searchParams.member;
  const member = Array.isArray(memberRaw) ? memberRaw[0] : memberRaw;
  return {
    status,
    piece: piece && piece.trim().length > 0 ? piece.trim() : null,
    member:
      member && member.trim().length > 0 ? member.trim().toLowerCase() : null,
  };
}

/** One comment plus everything that has happened under it. */
type Thread = {
  comment: CommentRecord;
  /** Newest event time anywhere in the thread. Drives the ordering. */
  lastActivityAt: number;
  /** True when the comment itself landed since the last visit. */
  commentIsNew: boolean;
  /** Ids of replies that landed since the last visit. */
  newReplyIds: Set<string>;
};

function threadIsNew(t: Thread): boolean {
  return t.commentIsNew || t.newReplyIds.size > 0;
}

function applyFilters(threads: Thread[], filters: Filters): Thread[] {
  return threads.filter(({ comment: c }) => {
    if (filters.status === "pending" && isApproved(c)) return false;
    if (filters.status === "approved" && !isApproved(c)) return false;
    if (filters.status === "featured" && !c.featured) return false;
    if (filters.piece && c.slug !== filters.piece) return false;
    if (filters.member) {
      const needle = filters.member;
      const haystack = `${c.email} ${c.displayName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function buildFilterHref(base: Filters, override: Partial<Filters>): string {
  const next = { ...base, ...override };
  const params = new URLSearchParams();
  if (next.status && next.status !== "all") params.set("status", next.status);
  if (next.piece) params.set("piece", next.piece);
  if (next.member) params.set("member", next.member);
  const qs = params.toString();
  return qs ? `?${qs}` : "/admin/comments";
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function CommentsAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isCommentsConfigured()) {
    return (
      <div className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <Link
          href="/admin/desk"
          className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
          style={{ fontSize: "0.65rem", fontWeight: 500 }}
        >
          &larr; Writer&apos;s Desk
        </Link>
        <p className="eyebrow mt-6 mb-6">Comments</p>
        <p className="deck max-w-md">
          Storage isn&apos;t configured. Set{" "}
          <code>UPSTASH_REDIS_REST_URL</code> and{" "}
          <code>UPSTASH_REDIS_REST_TOKEN</code>.
        </p>
      </div>
    );
  }

  // Read the seen stamp BEFORE bumping it, so the NEW marks below
  // describe the previous visit rather than this one.
  const seenAt = await getSectionSeen("comments").catch(() => 0);
  // Clear the unread dot for this section. Awaited so the seen mark is
  // in Redis before the client-side router.refresh() in
  // AdminPersistentNav re-fetches the layout's badges.
  await markSectionSeen("comments").catch(() => null);

  const resolvedParams = await searchParams;
  const filters = parseFilters(resolvedParams);

  // Events come back newest-first, so the first time a comment id
  // appears is its most recent activity — which makes the insertion
  // order the display order, no sort needed.
  const activity = await listRecentActivity(FEED_LIMIT);
  const threadsById = new Map<string, Thread>();
  const all: Thread[] = [];
  for (const { event, comment, reply } of activity) {
    let thread = threadsById.get(comment.id);
    if (!thread) {
      thread = {
        comment,
        lastActivityAt: event.at,
        commentIsNew: false,
        newReplyIds: new Set<string>(),
      };
      threadsById.set(comment.id, thread);
      all.push(thread);
    }
    if (event.at > seenAt) {
      if (reply) thread.newReplyIds.add(reply.id);
      else thread.commentIsNew = true;
    }
  }

  const filtered = applyFilters(all, filters);

  // One Arena read for the whole feed rather than one per comment.
  const resolvePiece = await commentPieceResolver(
    all.map((t) => t.comment)
  );

  // Piece dropdown: every slug that has at least one comment in the
  // current (unfiltered) feed, plus a friendlier title. Sorted by
  // title; "All pieces" stays at the top.
  const pieceTitleBySlug = new Map<string, string>();
  for (const { comment: c } of all) {
    if (pieceTitleBySlug.has(c.slug)) continue;
    pieceTitleBySlug.set(c.slug, resolvePiece(c.kind, c.slug, c.id).title);
  }
  const pieceOptions = Array.from(pieceTitleBySlug.entries())
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const pendingCount = filtered.filter((t) => !isApproved(t.comment)).length;
  const newCount = filtered.filter(threadIsNew).length;
  const filtersActive =
    filters.status !== "all" || !!filters.piece || !!filters.member;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <Link
        href="/admin/desk"
        className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
        style={{ fontSize: "0.65rem", fontWeight: 500 }}
      >
        &larr; Writer&apos;s Desk
      </Link>

      <h1
        className="font-display text-ink leading-tight tracking-tight mt-4 mb-3"
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Comments
      </h1>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        {STATUS_OPTIONS.map((opt) => {
          const active = filters.status === opt.value;
          return (
            <Link
              key={opt.value}
              href={buildFilterHref(filters, { status: opt.value })}
              className="font-display uppercase tracking-[0.22em] no-underline transition-colors"
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: active ? "var(--eye-deep)" : "var(--ink-faint)",
                borderBottom: active ? "1px solid var(--eye-deep)" : undefined,
                paddingBottom: "2px",
              }}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Piece + member form. GET so URL stays shareable. */}
      <form
        method="get"
        action="/admin/comments"
        className="flex flex-wrap items-end gap-3 mb-6"
      >
        {/* Status is set via chips, but persist it in the form so a
            submit doesn't drop it. */}
        {filters.status !== "all" && (
          <input type="hidden" name="status" value={filters.status} />
        )}
        <label className="flex flex-col gap-1">
          <span
            className="eyebrow"
            style={{ fontSize: "0.6rem", letterSpacing: "0.22em" }}
          >
            Piece
          </span>
          <select
            name="piece"
            defaultValue={filters.piece ?? ""}
            className="font-serif text-ink bg-paper border border-border px-2 py-1 outline-none focus:border-ink"
            style={{ fontSize: "0.92rem", minWidth: "14rem" }}
          >
            <option value="">All pieces</option>
            {pieceOptions.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span
            className="eyebrow"
            style={{ fontSize: "0.6rem", letterSpacing: "0.22em" }}
          >
            Member (name or email)
          </span>
          <input
            name="member"
            type="text"
            defaultValue={filters.member ?? ""}
            placeholder="adam@…"
            className="font-serif text-ink bg-paper border border-border px-2 py-1 outline-none focus:border-ink"
            style={{ fontSize: "0.92rem", minWidth: "12rem" }}
          />
        </label>
        <button
          type="submit"
          className="cta-prestige"
          style={{ alignSelf: "flex-end" }}
        >
          <span>Apply</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
        {filtersActive && (
          <Link
            href="/admin/comments"
            className="font-display uppercase tracking-[0.2em] text-ink-faint hover:text-ink no-underline transition-colors"
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              alignSelf: "flex-end",
              paddingBottom: "0.5rem",
            }}
          >
            clear
          </Link>
        )}
      </form>

      <p
        className="font-serif italic text-ink-muted mb-6 leading-relaxed"
        style={{ fontSize: "1rem" }}
      >
        {filtered.length === 0 ? (
          filtersActive ? (
            <>No comments match these filters.</>
          ) : (
            <>
              Nothing in the index yet. If you have older comments,
              rebuild the index below.
            </>
          )
        ) : (
          <>
            {filtered.length}
            {filtered.length === all.length ? <> total</> : <> of {all.length}</>}
            {newCount > 0 && (
              <>
                {" · "}
                <span
                  className="not-italic text-eye-deep"
                  style={{ fontWeight: 600 }}
                >
                  {newCount} new since your last visit
                </span>
              </>
            )}
            {pendingCount > 0 && (
              <>
                {" · "}
                <span
                  className="not-italic text-eye-deep"
                  style={{ fontWeight: 600 }}
                >
                  {pendingCount} pending
                </span>
              </>
            )}
            {all.length === FEED_LIMIT && (
              <> · feed capped at {FEED_LIMIT}</>
            )}
          </>
        )}
      </p>

      <div className="mb-10">
        <BackfillCommentsIndexButton />
      </div>

      {filtered.length > 0 && (
        <ul className="flex flex-col">
          {filtered.map((thread, idx) => {
            const c = thread.comment;
            const piece = resolvePiece(c.kind, c.slug, c.id);
            const pending = !isApproved(c);
            const replies = c.threadReplies ?? [];
            const isNew = threadIsNew(thread);
            // Pending keeps the olive rail it always had; an unread
            // thread gets the same rail without the fill, so the two
            // states stay distinguishable at a glance.
            const rail = pending
              ? {
                  background: "var(--paper-deep)",
                  borderLeft: "2px solid var(--eye-deep)",
                  paddingLeft: "1rem",
                }
              : isNew
                ? {
                    borderLeft: "2px solid var(--eye-deep)",
                    paddingLeft: "1rem",
                  }
                : undefined;
            return (
              <li
                key={c.id}
                className={idx === 0 ? "py-7" : "py-7 border-t border-rule"}
                style={rail}
              >
                {/* Piece reference + open-in-context link */}
                <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
                  <p className="eyebrow">
                    {piece.label}
                    {" · "}
                    <Link
                      href={piece.path}
                      className="text-ink-muted hover:text-eye-deep no-underline"
                    >
                      {piece.title}
                    </Link>
                  </p>
                  <Link
                    href={piece.path}
                    className="font-display uppercase tracking-[0.2em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                    style={{ fontSize: "0.65rem", fontWeight: 500 }}
                  >
                    open &rarr;
                  </Link>
                </div>

                {/* Author + time + pending pill */}
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
                    {formatTimestamp(c.createdAt)} &middot; {c.email}
                  </span>
                  {pending && (
                    <span
                      className="font-display uppercase tracking-[0.2em]"
                      style={{
                        fontSize: "0.62rem",
                        fontWeight: 600,
                        color: "var(--eye-deep)",
                        border: "1px solid var(--eye-deep)",
                        padding: "0.1rem 0.5rem",
                        letterSpacing: "0.18em",
                      }}
                    >
                      Pending
                    </span>
                  )}
                  {thread.commentIsNew && (
                    <span
                      className="font-display uppercase"
                      style={{
                        fontSize: "0.62rem",
                        fontWeight: 700,
                        color: "var(--paper)",
                        background: "var(--eye-deep)",
                        padding: "0.1rem 0.5rem",
                        letterSpacing: "0.18em",
                      }}
                    >
                      New
                    </span>
                  )}
                  {c.featured && (
                    <span
                      className="font-display uppercase"
                      style={{
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        color: "var(--eye-deep)",
                        letterSpacing: "0.24em",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{ marginRight: "0.25em" }}
                      >
                        &#10038;
                      </span>
                      Featured
                    </span>
                  )}
                  {c.paidComment && (
                    <span
                      className="font-display uppercase text-ink-faint"
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.24em",
                        fontWeight: 600,
                      }}
                      title="Non-member paid comment ($1)"
                    >
                      Guest &middot; $1
                    </span>
                  )}
                </div>

                {/* Body */}
                <div
                  className="font-serif text-ink leading-relaxed whitespace-pre-line"
                  style={{ fontSize: "1.02rem" }}
                >
                  {c.body}
                </div>

                {/* Existing reply preview (if posted) */}
                {c.replyBody && c.replyAt && (
                  <div
                    className="mt-5 pl-4"
                    style={{ borderLeft: "2px solid var(--eye-deep)" }}
                  >
                    <p className="eyebrow mb-2" style={{ fontSize: "0.62rem" }}>
                      Your reply &middot; {formatTimestamp(c.replyAt)}
                    </p>
                    <div
                      className="font-serif text-ink leading-relaxed whitespace-pre-line"
                      style={{ fontSize: "1rem" }}
                    >
                      {c.replyBody}
                    </div>
                  </div>
                )}

                {/* Thread replies. These have no index entry of their
                    own and live inside the parent's record, which is
                    why this page could not see them before. Newest
                    last, the way they read on the page. */}
                {replies.length > 0 && (
                  <ul className="mt-5 flex flex-col gap-4">
                    {replies.map((r) => {
                      const replyIsNew = thread.newReplyIds.has(r.id);
                      return (
                        <li
                          key={r.id}
                          className="pl-4"
                          style={{
                            borderLeft: replyIsNew
                              ? "2px solid var(--eye-deep)"
                              : "1px solid var(--rule)",
                          }}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                            <span
                              className="font-display text-ink"
                              style={{ fontSize: "0.88rem", fontWeight: 600 }}
                            >
                              {r.displayName}
                            </span>
                            <span
                              className="font-serif italic text-ink-faint"
                              style={{ fontSize: "0.78rem" }}
                            >
                              {formatTimestamp(r.createdAt)} &middot; {r.email}
                            </span>
                            {replyIsNew && (
                              <span
                                className="font-display uppercase"
                                style={{
                                  fontSize: "0.58rem",
                                  fontWeight: 700,
                                  color: "var(--paper)",
                                  background: "var(--eye-deep)",
                                  padding: "0.05rem 0.4rem",
                                  letterSpacing: "0.18em",
                                }}
                              >
                                New
                              </span>
                            )}
                          </div>
                          <div
                            className="font-serif text-ink leading-relaxed whitespace-pre-line"
                            style={{ fontSize: "0.97rem" }}
                          >
                            {r.body}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Actions: approve (if pending) + delete + feature
                    (only for approved). Featuring a pending comment
                    would surface it before the moderation pass, so
                    we gate the toggle behind approve. */}
                <div className="mt-4 flex flex-wrap items-center gap-5">
                  {pending && <ApproveCommentButton id={c.id} admin />}
                  <DeleteCommentButton id={c.id} admin />
                  {!pending && (
                    <FeatureCommentButton
                      commentId={c.id}
                      initialFeatured={!!c.featured}
                    />
                  )}
                </div>

                {/* Reply composer. Pre-populates with any existing
                    reply (re-opening becomes an edit). */}
                <AdminReplyControls
                  commentId={c.id}
                  existingReply={c.replyBody ?? null}
                  admin
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
