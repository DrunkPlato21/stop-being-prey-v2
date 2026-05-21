import type { TierBadge } from "@/lib/members";

// Founder + charter + tier chips render as siblings of the parent flex
// container (NOT inside a wrapper), so the parent's `gap` controls the
// spacing between username and every chip identically. "Same gap
// everywhere" guarantee.
//
// Visual system — every chip shares: dimensions, padding, border
// radius, border weight, typography, letter-spacing, weight, font
// size, line-height, and baseline alignment. The ONLY allowed
// difference is fill vs outline + the fill color:
//
//   FOUNDER  — filled olive interior, paper-cream text.
//              Permanent, earned by timing. First 100.
//   CHARTER  — filled bronze interior, paper-cream text.
//              Permanent, earned by timing. Next 100 after Founder.
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
// Founder/Charter slot displays after a middle-dot separator:
// "FOUNDER · 2", "CHARTER · 47". № renders poorly at chip size; # reads
// casual; the middle dot is the right separator for the prestige
// register.
//
// Founder and Charter are mutually exclusive (a member can hold at most
// one permanent-earned slot — tier is a single value on the record), so
// at most one of the two filled chips renders.

const TIER_LABEL: Record<TierBadge, string> = {
  hunter: "Hunter",
  operator: "Operator",
  apex: "Apex",
};

export function MemberBadge({
  founderSlot,
  charterSlot,
  tierBadge,
  size = "default",
}: {
  founderSlot: number | null;
  charterSlot?: number | null;
  tierBadge: TierBadge | null;
  /** "small" trims padding + font for in-thread replies; "default"
      sits beside top-level usernames. */
  size?: "default" | "small";
}) {
  if (
    founderSlot === null &&
    (charterSlot === null || charterSlot === undefined) &&
    tierBadge === null
  ) {
    return null;
  }

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
      {charterSlot !== null && charterSlot !== undefined && (
        <span className={`member-chip member-chip-charter${sizeClass}`}>
          <span>Charter</span>
          <span className="member-chip-sep" aria-hidden="true">
            &middot;
          </span>
          <span className="member-chip-slot">{charterSlot}</span>
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
