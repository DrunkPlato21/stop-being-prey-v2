"use client";

import { useEffect, useState } from "react";
import type { LoungeMedia as Media, LoungeImageMedia } from "@/lib/lounge";

// Renders a post's media: an image (click to open a lightbox) or a clean
// lazy-loaded 16:9 YouTube embed. YouTube's own player handles the poster
// + play button, and loading="lazy" keeps its heavy JS from loading until
// the embed scrolls into view — so it stays cheap without a custom
// click-to-play facade (which fought the player and rendered janky).
// Type-only import of the union keeps the Redis-backed lounge lib out of
// this client bundle.

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
  return (
    <div className="lounge-media lounge-media-video">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
        title="YouTube video"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
