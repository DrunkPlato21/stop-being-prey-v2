import { isApproved, type CommentRecord } from "@/lib/comments";
import { DeleteCommentButton } from "@/components/DeleteCommentButton";
import { AdminReplyControls } from "@/components/AdminReplyControls";
import { ApproveCommentButton } from "@/components/ApproveCommentButton";

// One comment + (optional) Clay reply. Server-rendered; interactive
// bits (delete, admin reply) are small client components dropped in.

function formatTimestamp(ms: number): string {
  // Mirror the article date format used elsewhere on the site, but
  // include time-of-day since comments are time-sensitive.
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

type Props = {
  comment: CommentRecord;
  viewerEmail: string | null;
  viewerIsAdmin: boolean;
};

export function CommentItem({ comment, viewerEmail, viewerIsAdmin }: Props) {
  const isAuthor =
    !!viewerEmail && viewerEmail.toLowerCase().trim() === comment.email;
  const canDelete = isAuthor || viewerIsAdmin;
  const pending = !isApproved(comment);

  return (
    <div
      id={`c-${comment.id}`}
      style={{
        scrollMarginTop: "5rem",
        opacity: pending ? 0.85 : 1,
      }}
    >
      {/* Header: name + timestamp + (optional) pending badge */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <span
          className="font-display text-ink"
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          {comment.displayName}
        </span>
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.82rem" }}
        >
          {formatTimestamp(comment.createdAt)}
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
            {isAuthor && !viewerIsAdmin
              ? "Awaiting review"
              : "Pending"}
          </span>
        )}
      </div>

      {/* Body */}
      <div>{renderBody(comment.body)}</div>

      {/* Member-author and admin actions */}
      {(canDelete || (viewerIsAdmin && pending)) && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {viewerIsAdmin && pending && (
            <ApproveCommentButton id={comment.id} />
          )}
          {canDelete && <DeleteCommentButton id={comment.id} />}
        </div>
      )}

      {/* Clay's reply (if posted) */}
      {comment.replyBody && comment.replyAt && (
        <div
          className="mt-5 pl-4"
          style={{ borderLeft: "2px solid var(--eye-deep)" }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <span
              className="font-display"
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "var(--eye-deep)",
                letterSpacing: "-0.005em",
              }}
            >
              Clay
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
      )}

      {/* Admin: post / replace / delete reply */}
      {viewerIsAdmin && (
        <AdminReplyControls
          commentId={comment.id}
          existingReply={comment.replyBody}
        />
      )}
    </div>
  );
}
