"use client";

import { useState } from "react";

// Copy-to-clipboard permalink button. Renders as a small chain-link
// icon next to the timestamp. On click, copies the absolute URL to
// the comment's anchor and briefly flips to a "copied" text label.
// The previous "#" glyph read as a hashtag to non-technical readers;
// the chain-link is the universally recognized "copy link" affordance.

type Props = {
  // Path + #anchor for the comment, e.g. "/some-essay#c-uuid".
  pathWithHash: string;
};

export function CommentPermalinkButton({ pathWithHash }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const absolute =
      typeof window !== "undefined"
        ? `${window.location.origin}${pathWithHash}`
        : pathWithHash;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absolute);
      } else {
        // Fallback for browsers without async clipboard.
        const ta = document.createElement("textarea");
        ta.value = absolute;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silent — fall back to the anchor click below.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Copy link to this comment"
      title={copied ? "Copied" : "Copy link"}
      className="bg-transparent border-0 cursor-pointer transition-colors"
      style={{
        color: copied ? "var(--eye-deep)" : "var(--ink-faint)",
        padding: "0.15rem 0.25rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        lineHeight: 1,
      }}
    >
      <svg
        aria-hidden="true"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {copied && (
        <span
          className="font-serif"
          style={{
            fontSize: "0.74rem",
            fontStyle: "italic",
          }}
        >
          copied
        </span>
      )}
    </button>
  );
}
