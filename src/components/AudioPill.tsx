"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpotifyEmbed } from "./SpotifyEmbed";

type AudioPillProps = {
  episodeId: string;
  minutes: number;
  // When set, the pill navigates here instead of toggling an inline player.
  // The homepage uses this to deep-link into the essay (/slug#listen) so the
  // audio is already open on arrival, no second click. When absent, the pill
  // is the in-page toggle and auto-opens if reached via that #listen hash.
  href?: string;
};

export function AudioPill({ episodeId, minutes, href }: AudioPillProps) {
  const [open, setOpen] = useState(false);

  // Open automatically when arrived via the homepage deep-link (/slug#listen).
  // Skipped on the link variant, which never renders an inline player.
  useEffect(() => {
    if (href) return;
    if (window.location.hash === "#listen") setOpen(true);
  }, [href]);

  if (href) {
    return (
      <div className="audio-pill-wrap">
        <Link href={href} className="audio-pill">
          <span className="audio-pill-glyph" aria-hidden="true">
            ♪
          </span>
          <span className="audio-pill-label">Listen · {minutes} min</span>
          <span className="audio-pill-caret" aria-hidden="true">
            ▸
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="audio-pill-wrap" id="listen">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="audio-pill"
      >
        <span className="audio-pill-glyph" aria-hidden="true">
          ♪
        </span>
        <span className="audio-pill-label">
          {open ? "Hide audio" : "Listen"} · {minutes} min
        </span>
        <span className="audio-pill-caret" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="audio-pill-embed">
          <SpotifyEmbed
            episodeId={episodeId}
            type="episode"
            size="standard"
          />
        </div>
      )}
    </div>
  );
}
