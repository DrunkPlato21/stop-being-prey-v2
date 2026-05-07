"use client";

import { useState } from "react";
import { SpotifyEmbed } from "./SpotifyEmbed";

type AudioPillProps = {
  episodeId: string;
  minutes: number;
};

export function AudioPill({ episodeId, minutes }: AudioPillProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="audio-pill-wrap">
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
          {open ? "Hide audio" : "Listen"} — {minutes} min
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
