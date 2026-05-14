import { getRecentActivity, type ActivityEvent } from "@/lib/activity";

// Activity stripe widget. Server component. Renders a compact list of
// recent events across new member signups, fresh comments, and wall
// donations — last 48h, capped at 12 entries. Horizontal-feeling
// vertical list so it reads as a low-key feed rather than a hero.

function formatDollars(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatRelative(at: number, now: number): string {
  const diff = now - at;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function describe(event: ActivityEvent): string {
  if (event.kind === "member" && event.member) {
    if (event.member.tier === "founder" && event.member.founderSlot) {
      return `new founder · No. ${event.member.founderSlot}`;
    }
    return "new member";
  }
  if (event.kind === "comment" && event.comment) {
    const snippet = event.comment.body.slice(0, 80).replace(/\s+/g, " ");
    const suffix = event.comment.body.length > 80 ? "…" : "";
    return `${event.comment.displayName}: "${snippet}${suffix}"`;
  }
  if (event.kind === "donation" && event.donation) {
    return `${event.donation.name} backed ${formatDollars(
      event.donation.amountCents
    )}`;
  }
  return "";
}

function linkFor(event: ActivityEvent): string | null {
  if (event.kind === "comment" && event.comment) {
    if (event.comment.pieceKind === "note") {
      return `/notes/field-notes/${event.comment.pieceSlug}#c-`;
    }
    return `/${event.comment.pieceSlug}#c-`;
  }
  if (event.kind === "donation" && event.donation) {
    return `/walls/${event.donation.wallSlug}`;
  }
  return null;
}

export async function ActivityStripe() {
  const events = await getRecentActivity({ windowHours: 48, limit: 12 });
  const now = Date.now();

  if (events.length === 0) {
    return null;
  }

  return (
    <section>
      <p
        className="eyebrow mb-4"
        style={{ letterSpacing: "0.32em", fontSize: "0.7rem" }}
      >
        Recent activity
      </p>
      <ul className="flex flex-col">
        {events.map((event, idx) => {
          const description = describe(event);
          const href = linkFor(event);
          const inner = (
            <div className="flex items-baseline justify-between gap-4 py-3">
              <p
                className="font-serif text-ink leading-relaxed truncate"
                style={{ fontSize: "0.95rem" }}
              >
                {description}
              </p>
              <span
                className="font-serif italic text-ink-faint shrink-0"
                style={{ fontSize: "0.78rem" }}
              >
                {formatRelative(event.at, now)}
              </span>
            </div>
          );
          return (
            <li
              key={`${event.kind}-${event.at}-${idx}`}
              className={idx === 0 ? "" : "border-t border-rule"}
            >
              {href ? (
                <a
                  href={href}
                  className="block no-underline hover:text-eye-deep transition-colors"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
