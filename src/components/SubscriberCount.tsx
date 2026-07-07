"use client";

import { formatCount, useSiteStats } from "@/components/useSiteStats";

// Live active-subscriber count, fetched client-side from /api/stats so
// the number is identical on every page (see useSiteStats). Falls back
// to a recent static floor when the endpoint is unreachable, so the
// line always renders a believable number. While loading it renders a
// non-breaking space in the same element so the layout never shifts.
const FALLBACK_COUNT = 9000;

type SubscriberCountProps = {
  className?: string;
};

export function SubscriberCount({ className = "" }: SubscriberCountProps) {
  const stats = useSiteStats();
  let text = " ";
  if (stats !== undefined) {
    const count = stats?.readers ?? FALLBACK_COUNT;
    text = `Join ${formatCount(count)} readers.`;
  }
  return (
    <p className={`eyebrow ${className}`} aria-live="polite">
      {text}
    </p>
  );
}
