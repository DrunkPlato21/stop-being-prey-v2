"use client";

import { useState } from "react";

// Click-to-play YouTube embed for Guild posts. Until someone presses play,
// it's just a thumbnail and a button: no YouTube iframe, no YouTube
// cookies, nothing heavy on the page. On click it swaps in the player from
// youtube-nocookie.com (the privacy-enhanced domain) and starts playing.
export function YouTubeEmbed({
  id,
  start,
  url,
}: {
  id: string;
  /** Start offset in seconds, carried over from a ?t= in the pasted link. */
  start?: number;
  /** The link as the member pasted it, kept as a fallback "open on YouTube". */
  url: string;
}) {
  const [playing, setPlaying] = useState(false);
  const params = new URLSearchParams({ autoplay: "1", rel: "0" });
  if (start) params.set("start", String(start));

  return (
    <div className="guild-yt">
      <div className="guild-yt-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
            title="YouTube video"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="guild-yt-poster"
            onClick={() => setPlaying(true)}
            aria-label="Play video"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
            />
            <span className="guild-yt-play" aria-hidden="true" />
          </button>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="guild-yt-link"
      >
        watch on YouTube
      </a>
    </div>
  );
}
