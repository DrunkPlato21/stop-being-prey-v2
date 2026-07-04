import Link from "next/link";
import type { GuildThread } from "@/lib/guild";
import { NewThreadComposer } from "./NewThreadComposer";
import { ClayReadSeal } from "./ClayReadSeal";
import { GuildByline, type GuildBadgeInfo } from "./GuildByline";
import { GuildCrest } from "./GuildCrest";
import { formatRelative } from "./guild-format";
import { guildCategoryLabel } from "@/lib/guild-constants";

// Small uppercase category tag. Reuses the eyebrow vocabulary so it reads
// as a kicker above the thread title, not a loud badge.
function CategoryTag({ slug }: { slug: string }) {
  return (
    <span
      className="font-display uppercase"
      style={{
        color: "var(--eye-deep)",
        letterSpacing: "0.2em",
        fontSize: "0.6rem",
        fontWeight: 600,
      }}
    >
      {guildCategoryLabel(slug)}
    </span>
  );
}

// The Guild index: the king's pinned Question of the Week at the top,
// then the library of member threads ordered by latest activity. Server
// component; the only interactive island is the composer.

function ReplyCount({ n }: { n: number }) {
  return (
    <span style={{ color: "var(--ink-faint)" }}>
      {n === 0 ? "No replies yet" : n === 1 ? "1 reply" : `${n} replies`}
    </span>
  );
}

// Quiet "this thread carries an image" marker for the index meta line.
// Monochrome, drawn in the same SVG register as the read-by-Clay seal so
// it reads as a thread attribute, not a loud badge or a colour emoji.
function ImageMark() {
  return (
    <span
      className="font-display uppercase"
      title="Has an image"
      style={{
        color: "var(--ink-muted)",
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.34rem",
        whiteSpace: "nowrap",
      }}
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
        <circle cx="5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
        <path d="M2.5 12.5 L6 8.5 L8 10.5 L10.5 7 L13.5 12.5" strokeWidth="0.9" />
      </svg>
      image
    </span>
  );
}

function MetaLine({
  thread,
  names,
  badges,
  adminEmail,
  hostEmail,
}: {
  thread: GuildThread;
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  hostEmail: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem 0.9rem",
        marginTop: "0.5rem",
        fontSize: "0.8rem",
        color: "var(--ink-muted)",
      }}
    >
      <GuildByline
        email={thread.authorEmail}
        names={names}
        badges={badges}
        adminEmail={adminEmail}
        hostEmail={hostEmail}
      />
      <span aria-hidden style={{ color: "var(--ink-faint)" }}>·</span>
      <span suppressHydrationWarning style={{ color: "var(--ink-faint)" }}>
        {formatRelative(thread.lastActivityAt)}
      </span>
      <span aria-hidden style={{ color: "var(--ink-faint)" }}>·</span>
      <ReplyCount n={thread.replyCount} />
      {thread.media && (
        <>
          <span aria-hidden style={{ color: "var(--ink-faint)" }}>·</span>
          <ImageMark />
        </>
      )}
      {thread.clayReadAt && (
        <>
          <span aria-hidden style={{ color: "var(--ink-faint)" }}>·</span>
          <ClayReadSeal at={thread.clayReadAt} />
        </>
      )}
    </div>
  );
}

export function GuildIndexView({
  pinned,
  threads,
  names,
  badges,
  adminEmail,
  hostEmail,
}: {
  pinned: GuildThread | null;
  threads: GuildThread[];
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  hostEmail: string | null;
}) {
  return (
    <div style={{ maxWidth: "44rem", margin: "0 auto", padding: "3rem 1.25rem 5rem" }}>
      {/* Masthead — a frontispiece for the library: the crest, the
          wordmark, and the charter in Clay's voice. */}
      <header
        style={{
          textAlign: "center",
          marginBottom: "3rem",
          paddingBottom: "2rem",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.6rem" }}>
          <GuildCrest size={64} />
        </div>
        <p
          className="eyebrow"
          style={{ letterSpacing: "0.34em", fontSize: "0.64rem", marginBottom: "0.3rem" }}
        >
          Members
        </p>
        <h1
          className="font-display"
          style={{
            fontSize: "2.7rem",
            lineHeight: 1.05,
            letterSpacing: "0.02em",
            margin: "0 0 1rem",
          }}
        >
          The Guild
        </h1>
        {/* The charter. The room's standing rule, in Clay's register. */}
        <p
          style={{
            fontStyle: "italic",
            color: "var(--ink-soft)",
            fontSize: "1.18rem",
            lineHeight: 1.55,
            maxWidth: "30rem",
            margin: "0 auto",
          }}
        >
          This is the deep room. Bring a real fight, or a real question.
          The Lounge is for talk. This is for the work.
        </p>
      </header>

      {/* Pinned Question of the Week */}
      {pinned && (
        <Link
          href={`/guild/${pinned.id}`}
          className="no-underline"
          style={{ display: "block", marginBottom: "2.5rem" }}
        >
          <div
            style={{
              borderLeft: "3px solid var(--eye-deep)",
              background: "var(--surface)",
              padding: "1.25rem 1.4rem",
              borderRadius: 2,
            }}
          >
            <p
              className="font-display uppercase"
              style={{
                color: "var(--eye-deep)",
                letterSpacing: "0.22em",
                fontSize: "0.64rem",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              Question of the Week
            </p>
            <h2
              className="font-display"
              style={{ fontSize: "1.7rem", lineHeight: 1.15, margin: 0, color: "var(--ink)" }}
            >
              {pinned.title}
            </h2>
            <MetaLine thread={pinned} names={names} badges={badges} adminEmail={adminEmail} hostEmail={hostEmail} />
          </div>
        </Link>
      )}

      {/* Compose */}
      <div style={{ marginBottom: "2.5rem" }}>
        <NewThreadComposer />
      </div>

      {/* The library */}
      {threads.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
          No open threads yet. Be the one to start the conversation.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {threads.map((t) => (
            <li
              key={t.id}
              style={{ borderTop: "1px solid var(--rule)", padding: "1.4rem 0" }}
            >
              <Link href={`/guild/${t.id}`} className="no-underline" style={{ display: "block" }}>
                <div style={{ marginBottom: "0.3rem" }}>
                  <CategoryTag slug={t.category} />
                </div>
                <h3
                  className="font-display"
                  style={{ fontSize: "1.45rem", lineHeight: 1.2, margin: 0, color: "var(--ink)" }}
                >
                  {t.title}
                </h3>
                <MetaLine thread={t} names={names} badges={badges} adminEmail={adminEmail} hostEmail={hostEmail} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
