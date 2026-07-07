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
