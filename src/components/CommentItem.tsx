import {
  COMMENT_EDIT_WINDOW_MS,
  isAdmin,
  isApproved,
  isWithinEditWindow,
  type CommentRecord,
  type ThreadReply,
} from "@/lib/comments";
import { DeleteCommentButton } from "@/components/DeleteCommentButton";
import { AdminReplyControls } from "@/components/AdminReplyControls";
import { ApproveCommentButton } from "@/components/ApproveCommentButton";
import { InitialAvatar } from "@/components/InitialAvatar";
import { EditCommentControls } from "@/components/EditCommentControls";
import { ReplyCommentForm } from "@/components/ReplyCommentForm";
import { CommentPermalinkButton } from "@/components/CommentPermalinkButton";
import { FeatureCommentButton } from "@/components/FeatureCommentButton";
import { DeleteThreadReplyButton } from "@/components/DeleteThreadReplyButton";
import { MemberBadge } from "@/components/MemberBadge";
import type { TierBadge } from "@/lib/members";

export type MemberBadgeInfo = {
  founderSlot: number | null;
  charterSlot: number | null;
  tierBadge: TierBadge | null;
};

// One comment + (optional) Clay reply + (optional) member-to-member
// thread replies. Server-rendered; the interactive bits (delete, edit,
// reply, permalink, feature) are small client components dropped in.

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderBody(body: string): React.ReactNode {
  // Body is sanitized at write-time (no HTML brackets, no control
  // chars). We split on double-newlines into paragraphs and on single
  // newlines into <br />s.
  const paragraphs = body.split(/\n\n/);
  return paragraphs.map((para, pi) => (
    <p
      key={pi}
      className="font-serif text-ink leading-relaxed"
      style={{ fontSize: "1.02rem", margin: pi === 0 ? 0 : "0.85rem 0 0 0" }}
    >
      {para.split("\n").map((line, li, arr) => (
        <span key={li}>
          {line}
          {li < arr.length - 1 && <br />}
        </span>
      ))}
    </p>
  ));
}

function permalinkPath(comment: CommentRecord): string {
  if (comment.kind === "article") {
    return `/${comment.slug}#c-${comment.id}`;
  }
  if (comment.kind === "case-file") {
    return `/case-files/${comment.slug}#c-${comment.id}`;
  }
  return `/notes/field-notes/${comment.slug}#c-${comment.id}`;
}

function threadReplyPermalinkPath(
  parent: CommentRecord,
  replyId: string
): string {
  if (parent.kind === "article") {
    return `/${parent.slug}#r-${replyId}`;
  }
  if (parent.kind === "case-file") {
    return `/case-files/${parent.slug}#r-${replyId}`;
  }
  return `/notes/field-notes/${parent.slug}#r-${replyId}`;
}

type Props = {
  comment: CommentRecord;
  viewerEmail: string | null;
  viewerIsAdmin: boolean;
  /** Resolved by Comments.tsx via getMember. Map keyed by normalized
      email → { founderSlot, tierBadge }. Drives the compound member
      badge for both top-level comments and thread replies. */
  memberBadgeByEmail?: Map<string, MemberBadgeInfo>;
  /** True when the viewer is a signed-in member with a displayName on
      file — gates the "Reply" CTA so we don't surface it to people who
      would just hit display_name_required at submit time. */
  viewerCanReply?: boolean;
};

export function CommentItem({
  comment,
  viewerEmail,
  viewerIsAdmin,
  memberBadgeByEmail,
  viewerCanReply = false,
}: Props) {
  const viewerWroteThis =
    !!viewerEmail && viewerEmail.toLowerCase().trim() === comment.email;
  const canDelete = viewerWroteThis || viewerIsAdmin;
  const canEdit = viewerWroteThis && isWithinEditWindow(comment.createdAt);
  const pending = !isApproved(comment);
  const byAuthor = isAdmin(comment.email);
  const featured = !!comment.featured;
  const threadReplies = comment.threadReplies ?? [];
  const badgeInfo = memberBadgeByEmail?.get(comment.email);
  const founderSlot = badgeInfo?.founderSlot ?? null;
  const charterSlot = badgeInfo?.charterSlot ?? null;
  const tierBadge = badgeInfo?.tierBadge ?? null;

  return (
    <div
      id={`c-${comment.id}`}
      className={byAuthor ? "pl-5" : ""}
      style={{
        scrollMarginTop: "5rem",
        opacity: pending ? 0.85 : 1,
        borderLeft: byAuthor ? "2px solid var(--eye-deep)" : undefined,
        borderTop:
          featured && !byAuthor ? "1px solid var(--eye-deep)" : undefined,
        paddingTop: featured && !byAuthor ? "1rem" : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        <InitialAvatar displayName={comment.displayName} size={30} />

        <div className="flex-1 min-w-0">
          {/* Header: name + AUTHOR / FOUNDER / FEATURED badges +
              timestamp + permalink + edited + pending pill */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3 min-w-0">
            <span
              className="font-display break-words"
              style={{
                fontSize: "0.95rem",
                fontWeight: byAuthor ? 700 : 600,
                color: byAuthor ? "var(--eye-deep)" : "var(--ink)",
                letterSpacing: "-0.005em",
                maxWidth: "100%",
              }}
            >
              {comment.displayName}
            </span>
            {byAuthor && (
              <span
                className="font-display uppercase"
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  color: "var(--eye-deep)",
                  background: "var(--paper-deep)",
                  border: "1px solid var(--eye-deep)",
                  padding: "0.15rem 0.55rem",
                  letterSpacing: "0.24em",
                }}
              >
                Author
              </span>
            )}
            {!byAuthor && (
              <MemberBadge
                founderSlot={founderSlot}
                charterSlot={charterSlot}
                tierBadge={tierBadge}
              />
            )}
            {comment.paidComment && !byAuthor && founderSlot === null && charterSlot === null && tierBadge === null && (
              <GuestChip
                showAmount={!!comment.paidShowAmount}
                amountCents={
                  typeof comment.paidAmountCents === "number"
                    ? comment.paidAmountCents
                    : null
                }
              />
            )}
            {featured && !byAuthor && (
              <span
                className="font-display uppercase"
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  color: "var(--eye-deep)",
                  letterSpacing: "0.24em",
                }}
              >
                <span aria-hidden="true" style={{ marginRight: "0.25em" }}>
                  &#10038;
                </span>
                Featured
              </span>
            )}
            <span
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.82rem" }}
            >
              {formatTimestamp(comment.createdAt)}
            </span>
            <CommentPermalinkButton pathWithHash={permalinkPath(comment)} />
            {comment.editedAt && (
              <span
                className="font-serif italic text-ink-faint"
                style={{ fontSize: "0.78rem" }}
                title={`Edited ${formatTimestamp(comment.editedAt)}`}
              >
                (edited)
              </span>
            )}
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
                {viewerWroteThis && !viewerIsAdmin
                  ? "Awaiting review"
                  : "Pending"}
              </span>
            )}
          </div>

          {/* Body */}
          <div>{renderBody(comment.body)}</div>

          {/* Actions row: Reply / Edit / Delete / Approve (pending +
              admin) / Feature (admin). Spaced out, italic-olive for
              the member-driven actions and small-caps for admin
              operations. */}
          {(canDelete || canEdit || viewerCanReply || viewerIsAdmin) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              {viewerCanReply && !pending && (
                <ReplyCommentForm commentId={comment.id} />
              )}
              {canEdit && (
                <EditCommentControls
                  commentId={comment.id}
                  initialBody={comment.body}
                  createdAt={comment.createdAt}
                />
              )}
              {canDelete && <DeleteCommentButton id={comment.id} />}
              {viewerIsAdmin && pending && (
                <ApproveCommentButton id={comment.id} />
              )}
              {viewerIsAdmin && !pending && (
                <FeatureCommentButton
                  commentId={comment.id}
                  initialFeatured={featured}
                />
              )}
            </div>
          )}

          {/* Clay's reply (if posted). Pinned to the top of the
              response stack — above the member-to-member thread —
              regardless of when it was actually written. The olive
              border + Author badge mark it as the editor's response
              so readers see it before scrolling through the back-and-
              forth. */}
          {comment.replyBody && comment.replyAt && (
            <div
              className="mt-5 pl-4"
              style={{ borderLeft: "2px solid var(--eye-deep)" }}
            >
              <div className="flex items-start gap-3">
                <InitialAvatar displayName="Clay" size={26} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                    <span
                      className="font-display"
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        color: "var(--eye-deep)",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      Clay
                    </span>
                    <span
                      className="font-display uppercase"
                      style={{
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        color: "var(--eye-deep)",
                        background: "var(--paper-deep)",
                        border: "1px solid var(--eye-deep)",
                        padding: "0.12rem 0.5rem",
                        letterSpacing: "0.24em",
                      }}
                    >
                      Author
                    </span>
                    <span
                      className="font-serif italic text-ink-faint"
                      style={{ fontSize: "0.82rem" }}
                    >
                      {formatTimestamp(comment.replyAt)}
                    </span>
                  </div>
                  <div>{renderBody(comment.replyBody)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Thread replies (member-to-member). Render flat, chrono,
              below Clay's pinned response. */}
          {threadReplies.length > 0 && (
            <ul className="mt-5 flex flex-col gap-5">
              {threadReplies.map((reply) => (
                <ThreadReplyView
                  key={reply.id}
                  parent={comment}
                  reply={reply}
                  viewerEmail={viewerEmail}
                  viewerIsAdmin={viewerIsAdmin}
                  memberBadgeByEmail={memberBadgeByEmail}
                />
              ))}
            </ul>
          )}

          {/* Admin: post / replace / delete reply. Lives below
              everything so the queue of reactions reads top-down:
              comment → member replies → Clay's reply → admin tools. */}
          {viewerIsAdmin && (
            <AdminReplyControls
              commentId={comment.id}
              existingReply={comment.replyBody}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadReplyView({
  parent,
  reply,
  viewerEmail,
  viewerIsAdmin,
  memberBadgeByEmail,
}: {
  parent: CommentRecord;
  reply: ThreadReply;
  viewerEmail: string | null;
  viewerIsAdmin: boolean;
  memberBadgeByEmail?: Map<string, MemberBadgeInfo>;
}) {
  const viewerWroteThis =
    !!viewerEmail && viewerEmail.toLowerCase().trim() === reply.email;
  const canDelete = viewerWroteThis || viewerIsAdmin;
  const canEdit = viewerWroteThis && isWithinEditWindow(reply.createdAt);
  const byAuthor = isAdmin(reply.email);
  const badgeInfo = memberBadgeByEmail?.get(reply.email);
  const founderSlot = badgeInfo?.founderSlot ?? null;
  const charterSlot = badgeInfo?.charterSlot ?? null;
  const tierBadge = badgeInfo?.tierBadge ?? null;

  return (
    <li
      id={`r-${reply.id}`}
      className="pl-4"
      style={{
        borderLeft: "2px solid var(--rule)",
        scrollMarginTop: "5rem",
      }}
    >
      <div className="flex items-start gap-3">
        <InitialAvatar displayName={reply.displayName} size={26} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2 min-w-0">
            <span
              className="font-display break-words"
              style={{
                fontSize: "0.92rem",
                fontWeight: byAuthor ? 700 : 600,
                color: byAuthor ? "var(--eye-deep)" : "var(--ink)",
                letterSpacing: "-0.005em",
                maxWidth: "100%",
              }}
            >
              {reply.displayName}
            </span>
            {byAuthor && (
              <span
                className="font-display uppercase"
                style={{
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  color: "var(--eye-deep)",
                  background: "var(--paper-deep)",
                  border: "1px solid var(--eye-deep)",
                  padding: "0.12rem 0.5rem",
                  letterSpacing: "0.24em",
                }}
              >
                Author
              </span>
            )}
            {!byAuthor && (
              <MemberBadge
                founderSlot={founderSlot}
                charterSlot={charterSlot}
                tierBadge={tierBadge}
                size="small"
              />
            )}
            <span
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.78rem" }}
            >
              {formatTimestamp(reply.createdAt)}
            </span>
            <CommentPermalinkButton
              pathWithHash={threadReplyPermalinkPath(parent, reply.id)}
            />
            {reply.editedAt && (
              <span
                className="font-serif italic text-ink-faint"
                style={{ fontSize: "0.75rem" }}
                title={`Edited ${formatTimestamp(reply.editedAt)}`}
              >
                (edited)
              </span>
            )}
          </div>
          <div>{renderBody(reply.body)}</div>
          {(canDelete || canEdit) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              {canEdit && (
                <EditCommentControls
                  endpoint={`/api/comments/${parent.id}/thread-reply/${reply.id}`}
                  method="PATCH"
                  initialBody={reply.body}
                  createdAt={reply.createdAt}
                />
              )}
              {canDelete && (
                <DeleteThreadReplyButton
                  commentId={parent.id}
                  replyId={reply.id}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// Re-export for callers that want to mirror the edit window cap.
export { COMMENT_EDIT_WINDOW_MS };

// === Guest chip ===========================================
// Renders next to a non-member paid commenter's name. Two variants:
//
//   [GUEST]              — default; the commenter didn't opt to
//                          show their contribution amount.
//   [GUEST · $5]         — the commenter checked "show my amount
//                          publicly" on the paid-comment form.
//
// Uses the same .member-chip vocabulary as the tier badges so it
// shares the olive-outline / cream-fill / small-caps treatment. The
// "$N" half reuses .member-chip-slot — lining figures, full size,
// no letter-spacing — same as the founder slot number.
function GuestChip({
  showAmount,
  amountCents,
}: {
  showAmount: boolean;
  amountCents: number | null;
}) {
  const dollarsLabel =
    showAmount && typeof amountCents === "number"
      ? formatGuestAmount(amountCents)
      : null;
  return (
    <span className="member-chip">
      <span>Guest</span>
      {dollarsLabel && (
        <>
          <span className="member-chip-sep" aria-hidden="true">
            &middot;
          </span>
          <span className="member-chip-slot">{dollarsLabel}</span>
        </>
      )}
    </span>
  );
}

function formatGuestAmount(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "$0";
  // Integer-dollar amounts read cleanest without the trailing ".00".
  // Sub-dollar precision keeps two decimal places.
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}
