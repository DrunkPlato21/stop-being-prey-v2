"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import type { TrackChannel } from "@/lib/channels";

type ShareButtonsProps = {
  url: string;
  title: string;
  /** Article slug, so a share click can be counted against the piece it
      came from. Optional: without it the event still counts site-wide. */
  slug?: string;
};

// Instrumentation, added before any redesign of this row. There was no
// way to tell whether readers use it at all, and making an unmeasured
// surface louder just gets you a louder unknown. Two halves:
//
//   share_click     outbound intent, per button, per piece
//   ?ref=share      inbound arrivals from a forward or a pasted link
//
// The tag goes on the email and copy-link URLs ONLY. Those two arrive
// with no referrer and were previously lumped into "direct". Twitter and
// Facebook are left clean because their referrer already identifies
// them, and tagging would pull that traffic out of its own bucket.

export function ShareButtons({ url, title, slug }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const fullUrl = url.startsWith("http")
    ? url
    : `https://stopbeingprey.com${url}`;

  const taggedUrl = `${fullUrl}${fullUrl.includes("?") ? "&" : "?"}ref=share`;

  const encodedUrl = encodeURIComponent(fullUrl);
  const encodedTaggedUrl = encodeURIComponent(taggedUrl);
  const encodedTitle = encodeURIComponent(title);

  const twitter = `https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`;
  const facebook = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const email = `mailto:?subject=${encodedTitle}&body=${encodedTitle}%0A%0A${encodedTaggedUrl}`;

  function recordShare(channel: TrackChannel) {
    track("share_click", { slug, channel });
  }

  async function handleCopy() {
    recordShare("share");
    try {
      await navigator.clipboard.writeText(taggedUrl);
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
          onClick={() => recordShare("twitter")}
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
          onClick={() => recordShare("facebook")}
        >
          Facebook
        </a>
      ),
    },
    {
      key: "email",
      node: (
        <a
          href={email}
          className="share-link"
          onClick={() => recordShare("email")}
        >
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
