"use client";

import { floorLabelFrom, useSiteStats } from "@/components/useSiteStats";

// Midterm siblings of the CharterSeats components. Same rules: live
// from /api/stats, no scarcity theater, and nothing renders while the
// Charter class is still open (Midterm only starts once Charter fills).
// /api/stats reports midtermRemaining as 0 after the hard close, so
// every line here disappears on Nov 4 with no deploy.

/** True when the Midterm window is the live public offer. */
export function isMidtermOpen(
  stats: ReturnType<typeof useSiteStats>
): boolean {
  return (
    !!stats &&
    stats.charterRemaining <= 0 &&
    typeof stats.midtermRemaining === "number" &&
    stats.midtermRemaining > 0
  );
}

/** Inline scarcity sentence, mirror of CharterSeatsInline. */
export function MidtermSeatsInline() {
  const stats = useSiteStats();
  if (!isMidtermOpen(stats) || !stats) return null;
  const n = stats.midtermRemaining ?? 0;
  return (
    <>
      {" "}
      {n} Midterm seat{n === 1 ? "" : "s"} left at {floorLabelFrom(stats)}/mo,
      locked for life.
    </>
  );
}

/** Just the seat number, for mid-sentence use. Mirror of
    CharterSeatsCount: never blank, falls back until stats answer. */
export function MidtermSeatsCount({ fallback = 50 }: { fallback?: number }) {
  const stats = useSiteStats();
  const n =
    stats && typeof stats.midtermRemaining === "number" &&
    stats.midtermRemaining > 0
      ? stats.midtermRemaining
      : fallback;
  return <>{n}</>;
}
