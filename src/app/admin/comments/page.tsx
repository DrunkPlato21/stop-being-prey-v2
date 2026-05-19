import Link from "next/link";
import type { Metadata } from "next";
import {
  isApproved,
  isCommentsConfigured,
  listRecentComments,
  type CommentRecord,
} from "@/lib/comments";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { getAllCaseFiles } from "@/lib/case-files";
import { ApproveCommentButton } from "@/components/ApproveCommentButton";
import { DeleteCommentButton } from "@/components/DeleteCommentButton";
import { AdminReplyControls } from "@/components/AdminReplyControls";
import { BackfillCommentsIndexButton } from "@/components/BackfillCommentsIndexButton";
import { FeatureCommentButton } from "@/components/FeatureCommentButton";
import { markSectionSeen } from "@/lib/admin-nav-badges";

// Chrono comment feed — every comment site-wide, newest first.
// Pending ones surface inline with a "Pending" pill so Clay can triage
// from the top and reply to approved comments without leaving the
// page. Filters (status / piece / member) live in URL params and are
// applied in-memory after the index read; at launch volume this is
// fine. Gated by proxy.ts via HTTP Basic auth on /admin/*.

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

function applyFilters(
  comments: CommentRecord[],
  filters: Filters
): CommentRecord[] {
  return comments.filter((c) => {
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

function pieceMeta(comment: CommentRecord): { title: string; url: string } {
  if (comment.kind === "article") {
    const a = getAllArticles().find((x) => x.slug === comment.slug);
    return {
      title: a?.title ?? comment.slug,
      url: `/${comment.slug}#c-${comment.id}`,
    };
  }
  if (comment.kind === "case-file") {
    const c = getAllCaseFiles().find((x) => x.slug === comment.slug);
    return {
      title: c?.title ?? comment.slug,
      url: `/case-files/${comment.slug}#c-${comment.id}`,
    };
  }
  const n = getAllFieldNotes().find((x) => x.slug === comment.slug);
  return {
    title: n?.title ?? comment.slug,
    url: `/notes/field-notes/${comment.slug}#c-${comment.id}`,
  };
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

  // Clear the unread dot for this section. Awaited so the seen mark is
  // in Redis before the client-side router.refresh() in
  // AdminPersistentNav re-fetches the layout's badges.
  await markSectionSeen("comments").catch(() => null);

  const resolvedParams = await searchParams;
  const filters = parseFilters(resolvedParams);

  const all = await listRecentComments(FEED_LIMIT);
  const filtered = applyFilters(all, filters);

  // Piece dropdown: every slug that has at least one comment in the
  // current (unfiltered) feed, plus a friendlier title. Sorted by
  // title; "All pieces" stays at the top.
  const pieceTitleBySlug = new Map<string, string>();
  for (const c of all) {
    if (pieceTitleBySlug.has(c.slug)) continue;
    pieceTitleBySlug.set(c.slug, pieceMeta(c).title);
  }
  const pieceOptions = Array.from(pieceTitleBySlug.entries())
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const pendingCount = filtered.filter((c) => !isApproved(c)).length;
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
          {filtered.map((c, idx) => {
            const piece = pieceMeta(c);
            const pending = !isApproved(c);
            return (
              <li
                key={c.id}
                className={idx === 0 ? "py-7" : "py-7 border-t border-rule"}
                style={
                  pending
                    ? {
                        background: "var(--paper-deep)",
                        borderLeft: "2px solid var(--eye-deep)",
                        paddingLeft: "1rem",
                      }
                    : undefined
                }
              >
                {/* Piece reference + open-in-context link */}
                <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
                  <p className="eyebrow">
                    {c.kind === "article"
                      ? "Essay"
                      : c.kind === "case-file"
                        ? "Case File"
                        : "Field Note"}
                    {" · "}
                    <Link
                      href={piece.url}
                      className="text-ink-muted hover:text-eye-deep no-underline"
                    >
                      {piece.title}
                    </Link>
                  </p>
                  <Link
                    href={piece.url}
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
