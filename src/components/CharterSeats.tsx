"use client";

import { useSiteStats } from "@/components/useSiteStats";

// The charter-scarcity sentence appended inside DualSubscribeBlock's
// paid column. Fetched client-side from /api/stats (see useSiteStats)
// so the seat count matches the force-dynamic membership page instead
// of freezing at whatever the surrounding page's cache last saw. No
// scarcity theater: renders nothing until the real number arrives, and
// quietly disappears once the charter cap fills or on any error.
export function CharterSeatsInline() {
  const stats = useSiteStats();
  if (!stats || stats.charterRemaining <= 0) return null;
  const n = stats.charterRemaining;
  return (
    <>
      {" "}
      {n} charter seat{n === 1 ? "" : "s"} left at $13/mo, locked for life.
    </>
  );
}

// Just the seat number, for use MID-SENTENCE where the surrounding words
// are the author's and only the figure is live. Unlike CharterSeatsInline
// this can never render nothing — a blank in the middle of a sentence is
// worse than a slightly stale number — so it falls back to the last known
// figure and swaps to the real one as soon as /api/stats answers. That
// also means it server-renders a number instead of flashing empty.
export function CharterSeatsCount({ fallback = 64 }: { fallback?: number }) {
  const stats = useSiteStats();
  const n =
    stats && stats.charterRemaining > 0 ? stats.charterRemaining : fallback;
  return <>{n}</>;
}
