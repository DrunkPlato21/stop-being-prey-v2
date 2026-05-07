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

  const twitter = `https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`;
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

  const items: { node: React.ReactNode; key: string }[] = [
    {
      key: "twitter",
      node: (
        <a
          href={twitter}
          target="_blank"
          rel="noopener noreferrer"
          className="share-link"
        >
          Twitter
        </a>
      ),
    },
    {
      key: "facebook",
      node: (
        <a
          href={facebook}
          target="_blank"
          rel="noopener noreferrer"
          className="share-link"
        >
          Facebook
        </a>
      ),
    },
    {
      key: "email",
      node: (
        <a href={email} className="share-link">
          Email
        </a>
      ),
    },
    {
      key: "copy",
      node: (
        <button onClick={handleCopy} className="share-link">
          {copied ? "Copied" : "Copy link"}
        </button>
      ),
    },
  ];

  return (
    <div className="text-center w-full">
      <p className="eyebrow mb-3">Pass it on</p>
      <p className="share-kicker">
        algorithms won&apos;t deliver this. you&apos;re how it travels.
      </p>
      <div className="dot-row">
        {items.map((it, i) => (
          <span key={it.key} className="dot-row-pair">
            {it.node}
            {i < items.length - 1 && (
              <span className="dot-row-sep" aria-hidden="true">
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
