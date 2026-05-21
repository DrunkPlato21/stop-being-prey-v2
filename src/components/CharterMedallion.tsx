// Charter-tier emblem. Sibling of FounderMedallion for accounts that
// hold one of the next 100 charter slots (after the 100 founder cap
// fills). Same chassis as the Founder medallion — cat-eye corners,
// centered prestige register — with the Charter label and the bronze
// accent rule under the slot number. The "locked for life" copy stays
// honest: the BADGE is what's locked, not the rate (Charter pays the
// same $13 floor as Regular; the privilege is the chip).

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

export function CharterMedallion({
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
      {/* Cat-eye corner ornaments. Stay olive — the corner vocabulary
          is the publication's signature mark, not the tier's. */}
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

      <div className="px-10 py-9 text-center">
        <p
          className="font-display uppercase mb-3"
          style={{
            fontSize: "0.85rem",
            letterSpacing: "0.34em",
            fontWeight: 600,
            color: "#8a5a2c",
          }}
        >
          Charter
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

        <div
          className="w-10 h-px mx-auto mb-4"
          style={{ background: "#8a5a2c" }}
          aria-hidden="true"
        />

        <p
          className="font-serif italic text-ink-muted"
          style={{ fontSize: "0.95rem" }}
        >
          {formatDollars(amountCents)}
          {cadence} &middot; Charter badge locked for life
        </p>
      </div>
    </div>
  );
}
