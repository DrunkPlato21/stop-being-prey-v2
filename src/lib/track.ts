import type { TrackEvent, TrackSource } from "@/lib/analytics";
import type { TrackChannel } from "@/lib/channels";

// Client-side event beacon. Fire-and-forget POST to /api/track. Prefers
// navigator.sendBeacon so events survive page unload (a reader who clicks
// away the instant they hit a scroll milestone still gets counted), with
// a keepalive fetch fallback. Never throws — analytics must not break the
// page. Types are imported type-only, so no server code reaches the
// client bundle.

export function track(
  event: TrackEvent,
  opts: {
    slug?: string;
    source?: TrackSource;
    channel?: TrackChannel;
    /** Canonical "host/path" of an off-site arrival. "view" only. */
    referrer?: string;
  } = {}
): void {
  if (typeof navigator === "undefined") return;
  try {
    const payload = JSON.stringify({
      event,
      slug: opts.slug,
      source: opts.source,
      channel: opts.channel,
      referrer: opts.referrer,
    });
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/track",
        new Blob([payload], { type: "application/json" })
      );
      return;
    }
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    /* swallow */
  }
}
