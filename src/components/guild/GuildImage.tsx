"use client";

import { useEffect, useState } from "react";
import type { GuildImageMedia } from "@/lib/guild";

// Renders one attached image: a click-to-open lightbox, reusing the Lounge's
// media + lightbox styling so images look the same across rooms. Type-only
// import keeps the Redis-backed guild lib out of this bundle.
//
// variant "block" (default) is the standalone look — natural aspect, top
// margin. "cell" is for a gallery grid: it fills its square cell (cover),
// drops the margin, and lets the parent own the spacing.
export function GuildImage({
  media,
  variant = "block",
}: {
  media: GuildImageMedia;
  variant?: "block" | "cell";
}) {
  const [open, setOpen] = useState(false);
  const cell = variant === "cell";

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
        style={
          cell
            ? {
                marginTop: 0,
                width: "100%",
                aspectRatio: "1 / 1",
                display: "block",
                overflow: "hidden",
              }
            : { marginTop: "1rem" }
        }
      >
        <img
          src={media.url}
          alt=""
          loading="lazy"
          width={media.width}
          height={media.height}
          draggable={false}
          style={
            cell
              ? { width: "100%", height: "100%", objectFit: "cover" }
              : undefined
          }
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
