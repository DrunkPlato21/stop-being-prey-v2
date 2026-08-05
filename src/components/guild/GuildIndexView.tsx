import Link from "next/link";
import type { GuildSearchResult, GuildThread } from "@/lib/guild";
import { GuildSearchBox, GuildSearchResults } from "./GuildSearch";
import { NewThreadComposer } from "./NewThreadComposer";
import { GuildByline, type GuildBadgeInfo } from "./GuildByline";
import { GuildCrest } from "./GuildCrest";
import { GuildNewTag } from "./GuildNewTag";
import { formatRelative } from "./guild-format";
import {
  GUILD_CATEGORIES,
  guildCategoryLabel,
  postImages,
  type GuildCategory,
} from "@/lib/guild-constants";

// The library's own filter. The composer has required a category since
// launch (it gates the Post button), and until now the index ignored it
// completely: a promise the writer made that the room didn't keep.
// URL-driven so a filtered view is linkable and needs no client state.
function CategoryFilter({ active }: { active: GuildCategory | null }) {
  const chips: { slug: GuildCategory | null; label: string }[] = [
    { slug: null, label: "All" },
    ...GUILD_CATEGORIES.map((c) => ({
      slug: c.slug as GuildCategory,
      label: c.label,
    })),
  ];
  return (
    // Four chips of four different widths wrapped 3 + 1 on a phone, which
    // orphaned "Open floor" beside a hole and left a ragged edge lining up
    // with nothing. Everything else in this header is a full-width block,
    // so the filters were the one thing that didn't. Two even columns on a
    // phone, one row once there's room for it.
    <div
      className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
      style={{ marginBottom: "1.5rem" }}
    >
      {chips.map((c) => {
        const on = c.slug === active;
        return (
          <Link
            key={c.slug ?? "all"}
            href={c.slug ? `/guild?kind=${c.slug}` : "/guild"}
            // Centred in its cell while the grid governs the width; on the
            // wide row the label sets the width again, as before.
            className="no-underline font-display uppercase tracking-[0.16em] text-center inline-flex items-center justify-center"
            aria-current={on ? "page" : undefined}
            style={{
              background: on ? "var(--eye-deep)" : "transparent",
              color: on ? "var(--surface)" : "var(--eye-deep)",
              border: "1px solid var(--eye-deep)",
              borderRadius: 2,
              padding: "0.45rem 0.8rem",
              fontSize: "0.64rem",
              fontWeight: 600,
            }}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}

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

// The NEW tag now lives in its own file: the thread page marks unread
// replies with the same one, and two copies of a scan cue drift.
const NewTag = GuildNewTag;

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

// The freshest-voice cue: "Last · <name> · <time>", a deep link to the
// newest reply's anchor on the thread page (which auto-scrolls to it). This
// is what resolves the old byline/time mismatch — the starter's name no
// longer carries a timestamp it didn't earn; the time now sits with the
// person who actually posted last. Clay speaking last gets the olive
// treatment, the one scent worth surfacing. No badge here (one per row).
function LastReplyLink({
  thread,
  names,
  adminEmail,
}: {
  thread: GuildThread;
  names: Record<string, string>;
  adminEmail: string | null;
}) {
  const norm = (thread.lastReplyAuthorEmail ?? "").toLowerCase().trim();
  const isClay = !!adminEmail && norm === adminEmail;
  const name = isClay ? "Clay" : names[norm] || "A member";
  return (
    <Link
      href={`/guild/${thread.id}#reply-${thread.lastReplyId}`}
      className="no-underline"
      style={{
        position: "relative",
        zIndex: 1,
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0.4rem",
        color: "var(--ink-muted)",
      }}
    >
      <span
        className="font-display uppercase"
        style={{
          color: "var(--ink-faint)",
          fontSize: "0.58rem",
          fontWeight: 600,
          letterSpacing: "0.16em",
        }}
      >
        Last
      </span>
      {/* Name + time underlined together as one clickable token, so it
          reads as a single link rather than a stray underlined word. */}
      <span
        style={{
          textDecoration: "underline",
          textDecorationColor: "var(--ink-soft)",
          textUnderlineOffset: "2px",
          textDecorationThickness: "1px",
        }}
      >
        <span
          style={{ fontWeight: 600, color: isClay ? "var(--eye-deep)" : "var(--ink)" }}
        >
          {name}
        </span>{" "}
        <span suppressHydrationWarning style={{ color: "var(--ink-faint)" }}>
          {formatRelative(thread.lastActivityAt)}
        </span>
      </span>
    </Link>
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
  const Dot = () => (
    <span aria-hidden style={{ color: "var(--ink-faint)" }}>·</span>
  );
  // A thread has a "last reply" cue once it carries a denormalized newest
  // reply (post-feature threads with at least one live reply). Legacy or
  // reply-less threads fall back to the plain time + byline.
  const hasLastReply =
    thread.replyCount > 0 && !!thread.lastReplyId && !!thread.lastReplyAuthorEmail;
  // Two zones, not one flat list. A single wrapping row put the dots
  // between items as standalone siblings, so the break landed wherever it
  // fit and left a separator pointing at nothing — trailing "8 replies ·"
  // at the end of one line, or a leading "·" opening the next. Grouping
  // WHO (name + chips) and WHAT (replies, last voice, image) means the
  // wrap can only happen at the seam between them, where no dot lives.
  // Wide viewports still render one line and look as they did.
  const zone: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem 0.9rem",
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        // Wider gap between the zones than inside them, so the seam reads
        // as a deliberate boundary on one line and not a missing dot.
        gap: "0.5rem 1.4rem",
        marginTop: "0.5rem",
        fontSize: "0.8rem",
        color: "var(--ink-muted)",
      }}
    >
      {/* GuildByline renders the name and chips as flat siblings so a
          parent gap spaces them uniformly. This zone keeps that contract:
          same 0.9rem gap it used to inherit from the row. */}
      <span style={zone}>
        <GuildByline
          email={thread.authorEmail}
          names={names}
          badges={badges}
          adminEmail={adminEmail}
          hostEmail={hostEmail}
          showSlot={false}
        />
      </span>
      <span style={zone}>
        {/* No replies yet: the starter IS the last voice, so the time stays
            on the byline. With replies, the time moves to the last-reply
            cue so it names its true author. */}
        {!hasLastReply && (
          <>
            <span suppressHydrationWarning style={{ color: "var(--ink-faint)" }}>
              {formatRelative(thread.lastActivityAt)}
            </span>
            <Dot />
          </>
        )}
        <ReplyCount n={thread.replyCount} />
        {hasLastReply && (
          <>
            <Dot />
            <LastReplyLink thread={thread} names={names} adminEmail={adminEmail} />
          </>
        )}
        {postImages(thread).length > 0 && (
          <>
            <Dot />
            <ImageMark />
          </>
        )}
        {/* No "read by Clay" seal here. It sat on nearly every thread in the
            index, which is no signal at all, and it was the widest mark in
            the row — the thing that wrapped and left a dangling separator
            behind it. The seal still renders on the thread itself, where it
            lands with weight instead of as list furniture. */}
      </span>
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
  lastViewedAt,
  needsDisplayName,
  category,
  hasMore,
  isPage2,
  q,
  search,
}: {
  pinned: GuildThread | null;
  threads: GuildThread[];
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  hostEmail: string | null;
  /** The member's prior Guild visit (epoch ms, 0 if never). Threads with
      later activity get a NEW marker. */
  lastViewedAt: number;
  /** Viewer has no display name yet — the composer reveals an inline name
      field, required before the thread posts. Never set for the admin. */
  needsDisplayName: boolean;
  /** Which kind of thread the library is filtered to, if any. */
  category: GuildCategory | null;
  /** More threads exist below this page. */
  hasMore: boolean;
  /** This is a "load older" page, not the top of the library. */
  isPage2: boolean;
  /** The current search query, empty when browsing. */
  q: string;
  /** Results, when there's a query. Null means show the library. */
  search: GuildSearchResult | null;
}) {
  // First-ever visitors (0) never see NEW, so the list doesn't flood.
  const isNew = (t: GuildThread) =>
    lastViewedAt > 0 && t.lastActivityAt > lastViewedAt;
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

      {/* Pinned Question of the Week. The card is no longer one big anchor:
          the title links to the thread top while the meta line carries its
          own deep link to the newest reply, so the two never nest. */}
      {pinned && (
        <div
          style={{
            borderLeft: "3px solid var(--eye-deep)",
            background: "var(--surface)",
            padding: "1.25rem 1.4rem",
            borderRadius: 2,
            marginBottom: "2.5rem",
          }}
        >
          <Link
            href={`/guild/${pinned.id}`}
            className="no-underline"
            style={{ display: "block" }}
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
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.6rem",
                flexWrap: "wrap",
              }}
            >
              <h2
                className="font-display"
                style={{ fontSize: "1.7rem", lineHeight: 1.15, margin: 0, color: "var(--ink)" }}
              >
                {pinned.title}
              </h2>
              {isNew(pinned) && <NewTag />}
            </div>
          </Link>
          <MetaLine thread={pinned} names={names} badges={badges} adminEmail={adminEmail} hostEmail={hostEmail} />
        </div>
      )}

      {/* The library header: find it, narrow it, or add to it. One block
          sitting directly on top of the list, rather than three controls
          floating between the Question of the Week and the first thread.
          No bottom rule — the first row of the list draws its own. */}
      <div
        style={{
          borderTop: "1px solid var(--rule)",
          marginTop: "2.5rem",
          paddingTop: "1.5rem",
        }}
      >
        <GuildSearchBox q={q} category={category} />
        {/* Filters only. The composer used to ride the end of this row and
            read as a fifth category, because an outlined small-caps box in
            this design language IS a chip. Filters change what you see;
            the composer makes something. Different jobs, different rows,
            different shapes. Neither belongs over a set of search results,
            which is a claim about matches, not about the room. */}
        {!search && <CategoryFilter active={category} />}
      </div>

      {/* The invitation to write, on its own line directly above the
          threads it adds to. Full-width and quiet: it reads as the top of
          the list rather than as another control in the header. */}
      {!search && (
        <div style={{ marginTop: "1.5rem" }}>
          <NewThreadComposer needsDisplayName={needsDisplayName} />
        </div>
      )}

      {/* A search takes over the page: the filter chips and the library
          listing are both claims about "everything", and neither is true
          next to a result set. One way back, stated plainly. */}
      {search ? (
        <>
          <p style={{ margin: "1.4rem 0" }}>
            <Link
              href={category ? `/guild?kind=${category}` : "/guild"}
              className="no-underline font-display uppercase tracking-[0.18em]"
              style={{ color: "var(--ink-faint)", fontSize: "0.66rem", fontWeight: 600 }}
            >
              ← Back to the Guild
            </Link>
          </p>
          <GuildSearchResults
            q={q}
            result={search}
            names={names}
            badges={badges}
            adminEmail={adminEmail}
            hostEmail={hostEmail}
          />
        </>
      ) : (
      <>

      {/* The library */}
      {threads.length === 0 ? (
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
          {category
            ? `Nothing in ${guildCategoryLabel(category)} yet. Yours would be the first.`
            : isPage2
            ? "That's every thread in the Guild."
            : "No open threads yet. Be the one to start the conversation."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {threads.map((t) => (
            <li
              key={t.id}
              style={{ borderTop: "1px solid var(--rule)", padding: "1.4rem 0" }}
            >
              {/* Title links to the thread top; the meta line's last-reply
                  cue is its own deep link. Kept as siblings so no anchor
                  nests inside another. */}
              <Link href={`/guild/${t.id}`} className="no-underline" style={{ display: "block" }}>
                {/* The kicker names the kind of thread. Under a filter every
                    row is that kind, so repeating it down the page is noise
                    the chip above already covers. */}
                {!category && (
                  <div style={{ marginBottom: "0.3rem" }}>
                    <CategoryTag slug={t.category} />
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "0.6rem",
                    flexWrap: "wrap",
                  }}
                >
                  <h3
                    className="font-display"
                    style={{ fontSize: "1.45rem", lineHeight: 1.2, margin: 0, color: "var(--ink)" }}
                  >
                    {t.title}
                  </h3>
                  {isNew(t) && <NewTag />}
                </div>
              </Link>
              <MetaLine thread={t} names={names} badges={badges} adminEmail={adminEmail} hostEmail={hostEmail} />
            </li>
          ))}
        </ul>
      )}

      {/* The list used to stop dead at 50 with nothing to say it had. The
          cursor is the oldest row shown, so "older" means strictly below
          this page and can't repeat a thread that got bumped meanwhile. */}
      {hasMore && threads.length > 0 && (
        <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "1.5rem", marginTop: "0.5rem" }}>
          <Link
            href={{
              pathname: "/guild",
              query: {
                ...(category ? { kind: category } : {}),
                before: threads[threads.length - 1].lastActivityAt,
              },
            }}
            className="no-underline font-display uppercase tracking-[0.18em]"
            style={{ color: "var(--eye-deep)", fontSize: "0.68rem", fontWeight: 600 }}
          >
            Older threads →
          </Link>
        </div>
      )}

      {isPage2 && (
        <div style={{ marginTop: "2rem" }}>
          <Link
            href={category ? `/guild?kind=${category}` : "/guild"}
            className="no-underline font-display uppercase tracking-[0.18em]"
            style={{ color: "var(--ink-faint)", fontSize: "0.68rem", fontWeight: 600 }}
          >
            ← Back to the top
          </Link>
        </div>
      )}
      </>
      )}
    </div>
  );
}
