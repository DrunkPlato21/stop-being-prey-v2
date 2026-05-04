"use client";

import { useState } from "react";

type ShareButtonsProps = {
  url: string;
  title: string;
};

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const fullUrl = url.startsWith("http")
    ? url
    : `https://stopbeingprey.com${url}`;

  const encodedUrl = encodeURIComponent(fullUrl);
  const encodedTitle = encodeURIComponent(title);

  const twitter = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const email = `mailto:?subject=${encodedTitle}&body=${encodedTitle}%0A%0A${encodedUrl}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="eyebrow text-xs">Share</span>
      <span className="text-rule">·</span>
      <a
        href={twitter}
        target="_blank"
        rel="noopener noreferrer"
        className="share-link"
      >
        Twitter
      </a>
      <span className="text-rule">·</span>
      <a
        href={facebook}
        target="_blank"
        rel="noopener noreferrer"
        className="share-link"
      >
        Facebook
      </a>
      <span className="text-rule">·</span>
      <a href={email} className="share-link">
        Email
      </a>
      <span className="text-rule">·</span>
      <button onClick={handleCopy} className="share-link">
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
