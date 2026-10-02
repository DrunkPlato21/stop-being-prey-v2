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
  /** Midterm seats left, 0 once the class is full OR the close date has
      passed. Optional: a cached response from before Midterm shipped
      will not carry it. */
  midtermRemaining?: number;
  /** ISO instant the Midterm class closes (end of Nov 3 2026 Pacific). */
  midtermClosesAt?: string;
  /** The live public floor, monthly cents: $13 while charter slots
      remain, $15 while midterm seats remain, $18 after that. Every client surface that names
      the price reads this rather than hardcoding a number, so the
      raise lands everywhere at once with no deploy. Optional on the
      type because a cached /api/stats response served from before this
      shipped will not carry it. */
  floorMonthlyCents?: number;
};

// What to show before /api/stats answers, and if it never does. Whole
// dollars, because every floor we have ever charged has been one.
const FALLBACK_FLOOR_MONTHLY_CENTS = 1300;

/** Whole-dollar label ("$13") for the live floor, with a fallback for
    the pre-load and failed-fetch cases. Mid-sentence copy can never
    render a blank, so this always returns something sayable. */
export function floorLabelFrom(
  stats: SiteStats | null | undefined
): string {
  const cents =
    stats && typeof stats.floorMonthlyCents === "number"
      ? stats.floorMonthlyCents
      : FALLBACK_FLOOR_MONTHLY_CENTS;
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}

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
