// The "Clay read this" mark. His attention is the coveted currency of the
// Guild, so when he marks a thread or reply seen it carries a quiet olive
// seal rather than a loud badge. Presentational only — safe in server or
// client trees.

export function ClayReadSeal({ at }: { at: number | null }) {
  if (!at) return null;
  return (
    <span
      className="font-display uppercase"
      title="Clay read this"
      style={{
        color: "var(--eye-deep)",
        fontSize: "0.6rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.34rem",
        whiteSpace: "nowrap",
      }}
    >
      {/* A struck seal: the crest's eye pressed into a ring. */}
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <circle cx="8" cy="8" r="7" />
        <path
          d="M2.5 8 C4 5.4, 12 5.4, 13.5 8 C12 10.6, 4 10.6, 2.5 8 Z"
          strokeWidth="0.9"
        />
        <ellipse cx="8" cy="8" rx="1.5" ry="2.6" fill="currentColor" stroke="none" />
      </svg>
      read by Clay
    </span>
  );
}
