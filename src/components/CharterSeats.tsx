"use client";

import { floorLabelFrom, useSiteStats } from "@/components/useSiteStats";

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
      {n} charter seat{n === 1 ? "" : "s"} left at {floorLabelFrom(stats)}/mo,
      locked for life.
    </>
  );
}

/**
 * The live public floor as a bare label ("$13" now, "$18" once the
 * charter cap fills), for copy that names the price outside a charter
 * sentence. Falls back to the charter-window figure until /api/stats
 * answers — never renders blank, same reasoning as CharterSeatsCount.
 */
export function FloorPrice() {
  const stats = useSiteStats();
  return <>{floorLabelFrom(stats)}</>;
}

/**
 * The patronage ask at the foot of every essay. Two sentences, one for
 * each side of the charter cap, because the charter form stops being
 * true the moment the last slot goes — and this line renders on
 * prerendered pages, where a stale seat count would otherwise sit on
 * the site until the next deploy.
 *
 * COPY: both variants are Clay's essay-closing line. The post-charter
 * form is the charter sentence with the finite thing removed; the rate
 * lock survives the window because a member's own rate still locks at
 * whatever they joined at.
 */
export function PatronRateLine() {
  const stats = useSiteStats();
  const charterOpen = !stats || stats.charterRemaining > 0;
  const floor = floorLabelFrom(stats);
  if (charterOpen) {
    return (
      <>
        <CharterSeatsCount /> charter seats left at {floor} a month, locked for
        life.
      </>
    );
  }
  return <>{floor} a month, locked for life.</>;
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
