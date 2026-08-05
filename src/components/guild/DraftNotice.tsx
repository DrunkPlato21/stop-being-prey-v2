"use client";

// One quiet line above a composer that opened with recovered text. States
// the fact and offers the one action a member could want. No banner, no
// icon, no colour: getting your words back should feel like nothing
// happened, because from the member's side nothing did.

export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <p
      style={{
        display: "flex",
        alignItems: "baseline",
        flexWrap: "wrap",
        gap: "0.7rem",
        margin: "0 0 0.6rem",
        fontSize: "0.82rem",
        fontStyle: "italic",
        color: "var(--ink-faint)",
      }}
    >
      Picked up where you left off.
      <button
        type="button"
        onClick={onDiscard}
        className="font-display uppercase tracking-[0.16em] hover:text-ink transition-colors"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          fontSize: "0.6rem",
          fontWeight: 600,
          fontStyle: "normal",
          color: "var(--ink-faint)",
          cursor: "pointer",
        }}
      >
        Discard
      </button>
    </p>
  );
}
