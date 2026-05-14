// Author name-plate. Rendered in the member area for the publisher
// account (ADMIN_EMAIL match). Shares vocabulary with FounderMedallion
// — same cat-eye corners, same surface card — but no slot number,
// no amount-locked-for-life line. The wordmark is the focal element,
// signalling a different level entirely from the founder/regular
// member tiers: this is the publication's owner.

type Props = {
  className?: string;
};

export function AuthorPlate({ className = "" }: Props) {
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
          className="font-display text-ink leading-none mb-4"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 3.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Author
        </p>

        <div className="w-10 h-px bg-eye mx-auto mb-4" aria-hidden="true" />

        <p
          className="font-serif italic text-ink-muted"
          style={{ fontSize: "0.95rem" }}
        >
          Stop Being Prey
        </p>
      </div>
    </div>
  );
}
