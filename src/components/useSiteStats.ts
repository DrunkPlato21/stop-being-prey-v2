"use client";

import { useEffect, useState } from "react";

// Client-side site stats shared by every counter component
// (SubscriberCount, MemberCount, CharterSeatsInline). One fetch of
// /api/stats per page load — the promise is module-level, so however
// many counters a page renders, they share a single request and always
// agree with each other. And because the numbers come from one endpoint
// instead of each page's own render, they also agree ACROSS pages,
// whatever each page's render/cache mode is.
//
// Hook return states: undefined = still loading, null = fetch failed,
// object = loaded. Components decide their own fallback copy.

export type SiteStats = {
  readers: number | null;
  members: number;
  founderRemaining: number;
  charterRemaining: number;
};

let statsPromise: Promise<SiteStats | null> | null = null;

function fetchStats(): Promise<SiteStats | null> {
  if (!statsPromise) {
    statsPromise = fetch("/api/stats")
      .then((res) => (res.ok ? (res.json() as Promise<SiteStats>) : null))
      .catch(() => null);
  }
  return statsPromise;
}

export function useSiteStats(): SiteStats | null | undefined {
  const [stats, setStats] = useState<SiteStats | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetchStats().then((s) => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return stats;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
