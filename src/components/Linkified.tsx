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

type Part =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

function split(text: string): Part[] {
  const out: Part[] = [];
  URL_RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[0];
    const trailing = raw.match(TRAILING_PUNCT_RE)?.[0] ?? "";
    const url = trailing ? raw.slice(0, raw.length - trailing.length) : raw;
    if (m.index > last) {
      out.push({ kind: "text", text: text.slice(last, m.index) });
    }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out.push({ kind: "link", text: url, href });
    if (trailing) out.push({ kind: "text", text: trailing });
    last = m.index + raw.length;
  }
  if (last < text.length) {
    out.push({ kind: "text", text: text.slice(last) });
  }
  return out;
}

export function Linkified({
  text,
  linkClassName,
}: {
  text: string;
  /** Override the default link styling if a callsite needs a different
      treatment. Defaults to the publication's gold-underline pattern. */
  linkClassName?: string;
}) {
  const parts = split(text);
  const linkClass =
    linkClassName ??
    "text-eye-deep underline decoration-1 underline-offset-2 hover:text-ink transition-colors break-words";
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "link" ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={linkClass}
          >
            {p.text}
          </a>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        )
      )}
    </>
  );
}
