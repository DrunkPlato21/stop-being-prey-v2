"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { confirmedAnonymous } from "@/components/chrome";

// Site-wide presence beacon. Mounted once in the root layout. Pings
// /api/presence/ping with the current path:
//   - on mount
//   - on pathname change (Next.js client routing)
//   - when the tab becomes visible again
//
// The endpoint silently no-ops for anonymous visitors and for the
// admin (Clay), so the panel only ever surfaces real member traffic.
// Admin and api routes are skipped client-side too — there's no
// useful presence signal in "Clay opened /admin/whatever."
//
// MIN_REPEAT_MS throttles same-path re-pings so navigating within an
// SPA section doesn't hammer the endpoint. Visibility returns bypass
// the throttle because that's the exact signal we want to refresh on.
//
// The endpoint no-ops for anonymous visitors, but it is a Node function
// and it verifies a session before deciding that, so every signed-out
// page view and every client-side route change was paying for an answer
// of "skipped: anon". Most traffic here is signed out, and this beacon
// sits in the root layout, so that was the most-called dynamic route on
// the site doing nothing. The sbp_who marker already tells us who is
// definitely anonymous (see components/chrome.ts); when it does, don't
// make the trip. A first visit has no marker yet and still pings once,
// and a member is unaffected.

const MIN_REPEAT_MS = 60_000;

function shouldTrack(path: string | null): path is string {
  if (!path) return false;
  if (confirmedAnonymous()) return false;
  if (path.startsWith("/admin")) return false;
  if (path.startsWith("/api/")) return false;
  return true;
}

function postPing(path: string) {
  void fetch("/api/presence/ping", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
    keepalive: true,
    cache: "no-store",
  }).catch(() => {
    // Network blip — next route change will retry. Presence is
    // best-effort; a missed ping just means the member shows as
    // slightly stale until the next nav.
  });
}

export function PresenceBeacon() {
  const pathname = usePathname();
  const lastPingRef = useRef<{ path: string; at: number } | null>(null);

  // Ping on mount + pathname change.
  useEffect(() => {
    if (!shouldTrack(pathname)) return;
    const now = Date.now();
    const last = lastPingRef.current;
    if (last && last.path === pathname && now - last.at < MIN_REPEAT_MS) {
      return;
    }
    lastPingRef.current = { path: pathname, at: now };
    postPing(pathname);
  }, [pathname]);

  // Re-ping on visibility return so a member who left and came back
  // shows as live, not stale.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== "visible") return;
      if (!shouldTrack(pathname)) return;
      lastPingRef.current = { path: pathname, at: Date.now() };
      postPing(pathname);
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);

  return null;
}
