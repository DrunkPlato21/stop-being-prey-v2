"use client";

import { formatCount, useSiteStats } from "@/components/useSiteStats";

// Live member count for the paid side of conversion surfaces — the
// parallel to SubscriberCount on the free side. Fetched client-side
// from /api/stats (see useSiteStats) so it matches every other page.
// Falls back to a believable floor (the 100 founder seats are already
// full) if the endpoint is unreachable, so the line always renders a
// real-looking number.
const FALLBACK_MEMBERS = 100;

export function MemberCount({ className = "" }: { className?: string }) {
  const stats = useSiteStats();
  let text = " ";
  if (stats !== undefined) {
    const count =
      stats && stats.members > 0 ? stats.members : FALLBACK_MEMBERS;
    text = `Join ${formatCount(count)} in the room.`;
  }
  return (
    <p className={`eyebrow ${className}`} aria-live="polite">
      {text}
    </p>
  );
}
