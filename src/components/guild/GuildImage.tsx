"use client";

import { useEffect, useState } from "react";
import type { GuildImageMedia } from "@/lib/guild";

// Renders a thread's attached image: a click-to-open lightbox, reusing the
// Lounge's media + lightbox styling so images look the same across rooms.
// Type-only import keeps the Redis-backed guild lib out of this bundle.
export function GuildImage({ media }: { media: GuildImageMedia }) {
  const [open, setOpen] = useState(false);

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
        style={{ marginTop: "1rem" }}
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
