"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";
import type { TrackEvent } from "@/lib/analytics";
import { computeReadingProgress } from "@/lib/reading-progress";

const MILESTONES = [25, 50, 75, 100] as const;

// Mounted on article pages. Fires one `view` on mount, then each
// `scroll_NN` milestone once as the reader moves through #reading-region.
// rAF-throttled, passive listeners, self-detaches once all milestones are
// in. Renders nothing.

export function ReadingTracker({
  slug,
  regionId = "reading-region",
}: {
  slug: string;
  regionId?: string;
}) {
  useEffect(() => {
    track("view", { slug });

    const region = document.getElementById(regionId);
    if (!region) return;

    const fired = new Set<number>();
    let ticking = false;

    const cleanup = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    const evaluate = () => {
      ticking = false;
      const pct = computeReadingProgress(region) * 100;
      for (const m of MILESTONES) {
        if (pct >= m && !fired.has(m)) {
          fired.add(m);
          track(`scroll_${m}` as TrackEvent, { slug });
        }
      }
      if (fired.size === MILESTONES.length) cleanup();
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Evaluate once up front: a short article may already be fully in view.
    evaluate();

    return cleanup;
  }, [slug, regionId]);

  return null;
}
