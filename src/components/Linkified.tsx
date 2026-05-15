import React from "react";

// Tiny render helper: turns plain text into a fragment where URLs are
// anchor tags and the rest is plain text. Newlines are preserved
// verbatim — the parent decides whether to wrap them via
// `white-space: pre-wrap`. Trailing punctuation that's clearly part of
// the sentence rather than the URL is split off so e.g. "see
// https://example.com." renders the period outside the link.
//
// Two URL shapes are matched:
//   - http(s) URLs           — used as-is for the href
//   - bare www.* URLs        — `https://` prepended for the href, raw
//                              text preserved for the visible label

// Stops at whitespace + a small set of structural characters that
// should never appear inside a pasted URL.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

// Punctuation we peel back off the right side of a match. Keeps the
// link's clickable region clean.
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"`]+$/;

// @-mention tokens. Caller opts in via the `highlightMentions` prop;
// when on, runs of `@<wordchars>` that follow whitespace or the start
// of the text are rendered with the publication's olive accent. The
// boundary check keeps email addresses (clay@example.com) from
// accidentally rendering as a mention. Only the visible token gets
// the highlight — resolution to a real member happens server-side at
// reply-create time; this component just renders.
const MENTION_RE = /(^|\s)@\w+/g;

type Part =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "mention"; text: string };

function split(text: string, withMentions: boolean): Part[] {
  // First pass — URL detection. Same logic as before; everything not
  // a URL stays in a "text" bucket and is fed through the mention
  // pass below.
  const urlParts: Part[] = [];
  URL_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[0];
    const trailing = raw.match(TRAILING_PUNCT_RE)?.[0] ?? "";
    const url = trailing ? raw.slice(0, raw.length - trailing.length) : raw;
    if (m.index > last) {
      urlParts.push({ kind: "text", text: text.slice(last, m.index) });
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    urlParts.push({ kind: "link", text: url, href });
    if (trailing) urlParts.push({ kind: "text", text: trailing });
    last = m.index + raw.length;
  }
  if (last < text.length) {
    urlParts.push({ kind: "text", text: text.slice(last) });
  }

  if (!withMentions) return urlParts;

  // Second pass — within each "text" bucket, split out @-mentions.
  // Links pass through untouched (we deliberately don't treat
  // `@something` inside a URL as a mention).
  const out: Part[] = [];
  for (const part of urlParts) {
    if (part.kind !== "text") {
      out.push(part);
      continue;
    }
    const body = part.text;
    MENTION_RE.lastIndex = 0;
    let cursor = 0;
    let mm: RegExpExecArray | null;
    while ((mm = MENTION_RE.exec(body)) !== null) {
      const matchStart = mm.index + (mm[1]?.length ?? 0);
      if (matchStart > cursor) {
        out.push({ kind: "text", text: body.slice(cursor, matchStart) });
      }
      const matchEnd = mm.index + mm[0].length;
      out.push({ kind: "mention", text: body.slice(matchStart, matchEnd) });
      cursor = matchEnd;
    }
    if (cursor < body.length) {
      out.push({ kind: "text", text: body.slice(cursor) });
    }
  }
  return out;
}

export function Linkified({
  text,
  linkClassName,
  highlightMentions = false,
}: {
  text: string;
  /** Override the default link styling if a callsite needs a different
      treatment. Defaults to the publication's gold-underline pattern. */
  linkClassName?: string;
  /** Render `@token` strings with an olive accent. Off by default so
      callsites that surface arbitrary user text (essay bodies, donor
      walls) don't accidentally style stray @-signs. The lounge opts
      in for posts + replies — that's where mentions are meaningful. */
  highlightMentions?: boolean;
}) {
  const parts = split(text, highlightMentions);
  const linkClass =
    linkClassName ??
    "text-eye-deep underline decoration-1 underline-offset-2 hover:text-ink transition-colors break-words";
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "link") {
          return (
            <a
              key={i}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={linkClass}
            >
              {p.text}
            </a>
          );
        }
        if (p.kind === "mention") {
          return (
            <span
              key={i}
              className="text-eye-deep font-display"
              style={{ fontWeight: 600 }}
            >
              {p.text}
            </span>
          );
        }
        return <React.Fragment key={i}>{p.text}</React.Fragment>;
      })}
    </>
  );
}
