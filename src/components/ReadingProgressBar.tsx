"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { computeReadingProgress } from "@/lib/reading-progress";

// Thin reading-progress line pinned to the top edge of the viewport,
// filling as the reader moves through #reading-region (the article body).
// Shares computeReadingProgress() with the scroll-depth analytics.
//
// Rendered at the ROOT (in layout, beside StickyNav) — NOT inside the
// page — because a position:fixed bar mounted within the page content
// gets trapped in a nested stacking context and paints behind the
// StickyNav. The codebase already moves StickyNav to the root for this
// exact reason. z-index 80 keeps the line above the masthead (50) and the
// slide-in nav (60).
//
// Because it lives in the persistent layout, it self-detects the article
// body on each route change via usePathname: present on essay pages,
// absent (renders nothing) everywhere else.

export function ReadingProgressBar({
  regionId = "reading-region",
}: {
  regionId?: string;
}) {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    let raf = 0;
    let attempts = 0;
    let removeListeners: (() => void) | null = null;

    const detach = () => {
      if (removeListeners) {
        removeListeners();
        removeListeners = null;
      }
    };

    const attach = () => {
      const region = document.getElementById(regionId);
      if (!region) {
        // On client navigations the new page's DOM can land a tick after
        // the pathname updates; retry a few frames before giving up.
        if (attempts++ < 8) {
          raf = requestAnimationFrame(attach);
        } else {
          setActive(false);
          setProgress(0);
        }
        return;
      }

      setActive(true);
      const update = () => {
        ticking.current = false;
        setProgress(computeReadingProgress(region));
      };
      const onScroll = () => {
        if (ticking.current) return;
        ticking.current = true;
        requestAnimationFrame(update);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      update();
      removeListeners = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    };

    attach();
    return () => {
      cancelAnimationFrame(raf);
      detach();
    };
  }, [regionId, pathname]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        zIndex: 80,
        pointerEvents: "none",
        // Faint always-on track so the bar reads even at 0%; gold fill
        // rides on top.
        backgroundColor: "rgba(184, 168, 44, 0.16)",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "100%",
          backgroundColor: "var(--eye, #b8a82c)",
          transform: `scaleX(${progress})`,
          transformOrigin: "left center",
          transition: "transform 80ms linear",
          willChange: "transform",
        }}
      />
    </div>
  );
}
