import Link from "next/link";
import { SEARCH_REPLY_CAP, type GuildSearchResult } from "@/lib/guild";
import { GuildByline, type GuildBadgeInfo } from "./GuildByline";
import { guildCategoryLabel } from "@/lib/guild-constants";
import { formatRelative } from "./guild-format";

// Search the library. A plain GET form: the query lives in the URL, so a
// result set is linkable, survives a reload, and needs no client state or
// a single line of JavaScript.

export function GuildSearchBox({
  q,
  category,
}: {
  q: string;
  /** Kept as a hidden field so searching doesn't silently drop the filter. */
  category?: string | null;
}) {
  return (
    <form
      action="/guild"
      method="get"
      style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem" }}
    >
      {category && <input type="hidden" name="kind" value={category} />}
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Search the library"
        aria-label="Search the Guild"
        className="w-full"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "0.95rem",
          color: "var(--ink)",
          padding: "0.5rem 0.7rem",
          outline: "none",
        }}
      />
      <button
        type="submit"
        className="font-display uppercase tracking-[0.16em]"
        style={{
          background: "transparent",
          color: "var(--eye-deep)",
          border: "1px solid var(--eye-deep)",
          borderRadius: 2,
          padding: "0 0.9rem",
          fontSize: "0.64rem",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Search
      </button>
    </form>
  );
}

// Mark the searched words inside a snippet. Case-insensitive, and the
// longest tokens go first so "rule" inside "rules" can't cut the match in
// half and leave a stray fragment unmarked.
function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const escaped = [...tokens]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const lower = tokens.map((t) => t.toLowerCase());
  return (
    <>
      {parts.map((p, i) =>
        lower.includes(p.toLowerCase()) ? (
          <mark
            key={i}
            style={{
              background: "rgba(184, 168, 44, 0.25)",
              color: "inherit",
              padding: "0 0.1em",
            }}
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function GuildSearchResults({
  q,
  result,
  names,
  badges,
  adminEmail,
  hostEmail,
}: {
  q: string;
  result: GuildSearchResult;
  names: Record<string, string>;
  badges: Record<string, GuildBadgeInfo>;
  adminEmail: string | null;
  hostEmail: string | null;
}) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const { hits } = result;

  return (
    <div>
      <p
        className="eyebrow"
        style={{ letterSpacing: "0.24em", fontSize: "0.62rem", marginBottom: "1rem" }}
      >
        {hits.length === 0
          ? "No matches"
          : hits.length === 1
          ? "1 thread"
          : `${hits.length} threads`}
      </p>

      {hits.length === 0 && (
        <p style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
          Nothing in the library matches that. Try one word instead of three.
        </p>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {hits.map((hit) => (
          <li
            key={hit.thread.id}
            style={{ borderTop: "1px solid var(--rule)", padding: "1.4rem 0" }}
          >
            <Link
              href={
                hit.replyId
                  ? `/guild/${hit.thread.id}#reply-${hit.replyId}`
                  : `/guild/${hit.thread.id}`
              }
              className="no-underline"
              style={{ display: "block" }}
            >
              <div style={{ marginBottom: "0.3rem" }}>
                <span
                  className="font-display uppercase"
                  style={{
                    color: "var(--eye-deep)",
                    letterSpacing: "0.2em",
                    fontSize: "0.6rem",
                    fontWeight: 600,
                  }}
                >
                  {guildCategoryLabel(hit.thread.category)}
                </span>
              </div>
              <h3
                className="font-display"
                style={{ fontSize: "1.35rem", lineHeight: 1.2, margin: 0, color: "var(--ink)" }}
              >
                <Marked text={hit.thread.title} tokens={tokens} />
              </h3>
            </Link>

            <p
              style={{
                margin: "0.5rem 0 0",
                fontSize: "0.92rem",
                lineHeight: 1.55,
                color: "var(--ink-soft)",
              }}
            >
              <Marked text={hit.snippet} tokens={tokens} />
            </p>

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
                email={hit.thread.authorEmail}
                names={names}
                badges={badges}
                adminEmail={adminEmail}
                hostEmail={hostEmail}
                showSlot={false}
              />
              <span suppressHydrationWarning style={{ color: "var(--ink-faint)" }}>
                {formatRelative(hit.thread.lastActivityAt)}
              </span>
              {/* Say where the match actually is, so a snippet that isn't in
                  the opening post doesn't read as one. */}
              {hit.replyId && (
                <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
                  {hit.matchingReplies === 1
                    ? "matched in a reply"
                    : `matched in ${hit.matchingReplies} replies`}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* No silent caps: if the scan didn't cover everything, say so. */}
      {!result.fullyScanned && (
        <p
          style={{
            marginTop: "1.5rem",
            fontSize: "0.82rem",
            fontStyle: "italic",
            color: "var(--ink-faint)",
          }}
        >
          Replies were searched in the {SEARCH_REPLY_CAP} most recently
          active threads. Older threads matched on their title and opening
          post.
        </p>
      )}
    </div>
  );
}
