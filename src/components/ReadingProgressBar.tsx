"use client";

import { useEffect, useRef, useState } from "react";
import { computeReadingProgress } from "@/lib/reading-progress";

// Thin reading-progress line pinned to the very top edge of the viewport.
// Fills left-to-right as the reader moves through #reading-region (the
// article body), using the same measurement as the scroll-depth
// analytics so the two always agree.
//
// Stacking: z-index 70 sits above the masthead (z-50) and the slide-in
// StickyNav (z-60). At the top of the page progress is ~0, so the line is
// invisible over the masthead; once the reader scrolls and the StickyNav
// appears, the line rides its top edge. Uses transform: scaleX so updates
// never trigger layout, and is pointer-transparent + aria-hidden so it
// stays purely decorative.

export function ReadingProgressBar({
  regionId = "reading-region",
}: {
  regionId?: string;
}) {
  const [progress, setProgress] = useState(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    const region = document.getElementById(regionId);
    if (!region) return;

    const update = () => {
      tickingRef.current = false;
      setProgress(computeReadingProgress(region));
    };
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [regionId]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        zIndex: 70,
        pointerEvents: "none",
        // Faint always-on track so the bar's location reads even at 0%;
        // the gold fill rides on top of it.
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
