"use client";

import { useState } from "react";

// Copy-to-clipboard permalink button. Renders as a small "#" next to
// the timestamp. On click, copies the absolute URL to the comment's
// anchor and briefly flips to "copied" feedback.

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
      className="font-serif bg-transparent border-0 cursor-pointer p-0 transition-colors"
      style={{
        fontSize: "0.82rem",
        color: copied ? "var(--eye-deep)" : "var(--ink-faint)",
        fontStyle: "italic",
      }}
    >
      {copied ? "copied" : "#"}
    </button>
  );
}
