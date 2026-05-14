// Founder-tier emblem. Rendered in the member area to mark accounts
// that hold one of the first 100 founder slots. Cat-eye corner
// brackets match the tip card / wall donate card vocabulary so the
// member area reads as part of the same publication, not a separate
// "dashboard" surface.
//
// Composition (top to bottom): small uppercase "FOUNDER" eyebrow in
// the gold accent, the slot number rendered large in the display
// serif as "№ N", a short hairline rule, and the cadence/amount
// reassurance "locked for life".

type Props = {
  slot: number;
  amountCents: number;
  interval: "month" | "year";
  className?: string;
};

function formatDollars(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

export function FounderMedallion({
  slot,
  amountCents,
  interval,
  className = "",
}: Props) {
  const cadence = interval === "month" ? "/mo" : "/yr";
  return (
    <div
      className={`relative bg-surface border border-border max-w-sm mx-auto ${className}`}
    >
      {/* Cat-eye corner ornaments */}
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

      <div className="px-10 py-9 text-center">
        <p
          className="font-display uppercase text-eye-deep mb-3"
          style={{
            fontSize: "0.85rem",
            letterSpacing: "0.34em",
            fontWeight: 600,
          }}
        >
          Founder
        </p>

        <p
          className="font-display text-ink leading-none mb-4"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 3.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          №&thinsp;{slot}
        </p>

        <div className="w-10 h-px bg-eye mx-auto mb-4" aria-hidden="true" />

        <p
          className="font-serif italic text-ink-muted"
          style={{ fontSize: "0.95rem" }}
        >
          {formatDollars(amountCents)}
          {cadence} locked for life
        </p>
      </div>
    </div>
  );
}
