"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/track";
import type { TrackEvent, TrackSource } from "@/lib/analytics";

// Fires a single track() event the first time its marker scrolls into
// view (>=50% visible). Renders a 1px block so there is a node to observe.
// Used for `form_seen` on the inline subscribe form; reusable for any
// "was this surface actually seen" measurement.

export function TrackOnView({
  event,
  slug,
  source,
}: {
  event: TrackEvent;
  slug?: string;
  source?: TrackSource;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || fired.current) return;

    if (typeof IntersectionObserver === "undefined") {
      fired.current = true;
      track(event, { slug, source });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired.current) {
            fired.current = true;
            track(event, { slug, source });
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [event, slug, source]);

  return (
    <span ref={ref} aria-hidden="true" style={{ display: "block", height: 1 }} />
  );
}
