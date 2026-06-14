"use client";

import { useEffect, useState } from "react";
import type { LoungeMedia as Media, LoungeImageMedia } from "@/lib/lounge";
import { youTubeEmbedUrl, youTubeThumb } from "@/lib/youtube";

// Renders a post's media: an image (click to open a lightbox) or a
// YouTube embed (click-to-play facade — only the ~20KB thumbnail loads
// until the reader hits play, so a feed full of videos stays fast and
// costs nothing). Type-only import of the union keeps the Redis-backed
// lounge lib out of this client bundle.

export function LoungeMedia({ media }: { media: Media }) {
  if (media.type === "image") return <LoungeImage media={media} />;
  return <LoungeYouTube videoId={media.videoId} />;
}

function LoungeImage({ media }: { media: LoungeImageMedia }) {
  const [open, setOpen] = useState(false);

  // Close the lightbox on Escape, and lock body scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lounge-media lounge-media-image"
        aria-label="Open image"
      >
        <img
          src={media.url}
          alt=""
          loading="lazy"
          width={media.width}
          height={media.height}
          draggable={false}
        />
      </button>
      {open && (
        <div
          className="lounge-lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media.url} alt="" />
        </div>
      )}
    </>
  );
}

function LoungeYouTube({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="lounge-media lounge-media-video">
        <iframe
          src={youTubeEmbedUrl(videoId)}
          title="YouTube video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="lounge-media lounge-media-video lounge-yt-facade"
      aria-label="Play video"
    >
      <img src={youTubeThumb(videoId)} alt="" loading="lazy" draggable={false} />
      <span className="lounge-yt-play" aria-hidden="true" />
    </button>
  );
}
