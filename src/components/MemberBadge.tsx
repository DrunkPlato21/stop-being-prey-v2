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
//   MIDTERM  - filled slate interior, paper-cream text.
//              Permanent, earned by timing. 50 seats after Charter,
//              closed after Nov 3 2026. The last numbered class.
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
// Founder, Charter and Midterm are mutually exclusive (a member can hold at most
// one permanent-earned slot — tier is a single value on the record), so
// at most one of the filled chips renders.

const TIER_LABEL: Record<TierBadge, string> = {
  hunter: "Hunter",
  operator: "Operator",
  apex: "Apex",
};

export function MemberBadge({
  founderSlot,
  charterSlot,
  midtermSlot,
  tierBadge,
  size = "default",
  showSlot = true,
}: {
  founderSlot: number | null;
  charterSlot?: number | null;
  midtermSlot?: number | null;
  tierBadge: TierBadge | null;
  /** "small" trims padding + font for in-thread replies; "default"
      sits beside top-level usernames. */
  size?: "default" | "small";
  /** Drop the "· 37" slot number, keeping the tier word alone. For dense
      list contexts (the Guild index) where the row is a navigation aid
      and the number is prestige, not wayfinding — it was the widest thing
      in the meta line and pushed later marks onto a second row. Standing
      still reads: the chip is still there, still filled olive. Everywhere
      a member's identity is the point (Lounge, comments, a thread's own
      byline) this stays true and the number shows. */
  showSlot?: boolean;
}) {
  if (
    founderSlot === null &&
    (charterSlot === null || charterSlot === undefined) &&
    (midtermSlot === null || midtermSlot === undefined) &&
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
          {showSlot && (
            <>
              <span className="member-chip-sep" aria-hidden="true">
                &middot;
              </span>
              <span className="member-chip-slot">{founderSlot}</span>
            </>
          )}
        </span>
      )}
      {charterSlot !== null && charterSlot !== undefined && (
        <span className={`member-chip member-chip-charter${sizeClass}`}>
          <span>Charter</span>
          {showSlot && (
            <>
              <span className="member-chip-sep" aria-hidden="true">
                &middot;
              </span>
              <span className="member-chip-slot">{charterSlot}</span>
            </>
          )}
        </span>
      )}
      {midtermSlot !== null && midtermSlot !== undefined && (
        <span className={`member-chip member-chip-midterm${sizeClass}`}>
          <span>Midterm</span>
          {showSlot && (
            <>
              <span className="member-chip-sep" aria-hidden="true">
                &middot;
              </span>
              <span className="member-chip-slot">{midtermSlot}</span>
            </>
          )}
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
