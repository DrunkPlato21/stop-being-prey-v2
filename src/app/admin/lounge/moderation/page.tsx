import Link from "next/link";
import type { Metadata } from "next";
import { listModerationLog } from "@/lib/lounge";

export const metadata: Metadata = {
  title: "Lounge moderation log, admin",
};

export const dynamic = "force-dynamic";

// Admin moderation log for /lounge actions. HTTP Basic auth gates
// /admin/* via proxy.ts. Read-only at V1 — every deletion and pin
// shows up here with timestamp + actor.

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function actionLabel(action: string): string {
  switch (action) {
    case "delete_post":
      return "Post deleted";
    case "delete_reply":
      return "Reply deleted";
    case "pin":
      return "Pinned";
    case "unpin":
      return "Unpinned";
    default:
      return action;
  }
}

export default async function LoungeModerationPage() {
  const entries = await listModerationLog(200);

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
        Lounge moderation
      </h1>

      <p
        className="font-serif italic text-ink-muted mb-10 leading-relaxed"
        style={{ fontSize: "1rem" }}
      >
        Every deletion and pin action on the Lounge, newest first.
        Soft deletes — the underlying record stays for the audit
        trail.
      </p>

      {entries.length === 0 ? (
        <p
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "1rem" }}
        >
          No moderation actions yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((e, idx) => (
            <li
              key={`${e.ts}-${e.targetId}-${idx}`}
              className={
                idx === 0 ? "py-5" : "py-5 border-t border-rule"
              }
            >
              <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="font-display uppercase text-eye-deep"
                    style={{
                      fontSize: "0.62rem",
                      letterSpacing: "0.24em",
                      fontWeight: 700,
                    }}
                  >
                    {actionLabel(e.action)}
                  </span>
                  <span
                    className="font-serif italic text-ink-muted"
                    style={{ fontSize: "0.86rem" }}
                  >
                    by {e.authorFirstName}{" "}
                    <span className="text-ink-faint">
                      &lt;{e.authorEmail}&gt;
                    </span>
                  </span>
                </div>
                <span
                  className="font-serif italic text-ink-faint"
                  style={{ fontSize: "0.78rem" }}
                >
                  {formatTime(e.ts)}
                </span>
              </div>
              {e.bodySnapshot && (
                <p
                  className="font-serif text-ink-muted leading-relaxed pl-3"
                  style={{
                    fontSize: "0.92rem",
                    borderLeft: "2px solid var(--rule)",
                  }}
                >
                  {e.bodySnapshot}
                </p>
              )}
              <p
                className="font-display uppercase text-ink-faint mt-2"
                style={{
                  fontSize: "0.6rem",
                  letterSpacing: "0.22em",
                  fontWeight: 500,
                }}
              >
                target: {e.targetId.slice(0, 8)}
                {e.targetParentId && (
                  <>
                    {" "}
                    &middot; parent: {e.targetParentId.slice(0, 8)}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
