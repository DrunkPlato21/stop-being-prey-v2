import type { TierBadge } from "@/lib/members";

// Founder + tier chips render as two siblings of the parent flex
// container (NOT inside a wrapper), so the parent's `gap` controls
// the spacing between username, founder chip, and tier chip
// identically. That's the "same gap everywhere" guarantee.
//
// Visual system — every chip shares: dimensions, padding, border
// radius, border weight, typography, letter-spacing, weight, font
// size, line-height, and baseline alignment. The ONLY allowed
// difference is fill vs outline:
//
//   FOUNDER  — filled olive interior, paper-cream text.
//              Permanent, earned by timing, limited-edition feel.
//   TIER     — paper interior, olive border + olive text.
//              Current, recurring, member-chosen.
//
// Color escalation: APEX is the single saturated accent in the
// system. HUNTER and OPERATOR are visually identical olive chips —
// the label distinguishes them, not the color.
//   HUNTER     olive   (base prestige register)
//   OPERATOR   olive   (same as HUNTER — label does the work)
//   APEX       claret  (the only saturated chip in the system)
//
// Founder slot displays after a middle-dot separator: "FOUNDER · 2".
// № renders poorly at chip size; # reads casual; the middle dot is
// the right separator for the prestige register.

const TIER_LABEL: Record<TierBadge, string> = {
  hunter: "Hunter",
  operator: "Operator",
  apex: "Apex",
};

export function MemberBadge({
  founderSlot,
  tierBadge,
  size = "default",
}: {
  founderSlot: number | null;
  tierBadge: TierBadge | null;
  /** "small" trims padding + font for in-thread replies; "default"
      sits beside top-level usernames. */
  size?: "default" | "small";
}) {
  if (founderSlot === null && tierBadge === null) return null;

  const sizeClass = size === "small" ? " member-chip-small" : "";

  return (
    <>
      {founderSlot !== null && (
        <span className={`member-chip member-chip-founder${sizeClass}`}>
          <span>Founder</span>
          <span className="member-chip-sep" aria-hidden="true">
            &middot;
          </span>
          <span className="member-chip-slot">{founderSlot}</span>
        </span>
      )}
      {tierBadge !== null && (
        <span
          className={`member-chip member-chip-${tierBadge}${sizeClass}`}
        >
          {TIER_LABEL[tierBadge]}
        </span>
      )}
    </>
  );
}
