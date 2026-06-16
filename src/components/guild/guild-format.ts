// Shared formatting helpers for the Guild UI.

/**
 * Calm relative time. The Guild is a library, not a live feed, so this
 * stays quiet: "just now", then minutes/hours/days, then an absolute
 * short date once a thread is older than a week. Rendered inside a
 * suppressHydrationWarning element since the value depends on the
 * current clock at render time.
 */
export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** The name to show for an author, with a quiet fallback. */
export function authorName(
  email: string,
  names: Record<string, string>
): string {
  return names[email.toLowerCase().trim()] || "A member";
}
