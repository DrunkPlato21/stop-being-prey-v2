"use client";

import { useRef, useState } from "react";
import { MemberBadge } from "@/components/MemberBadge";
import type { TierBadge } from "@/lib/members";

// Pay-what-you-want subscription form.
//
// The displayed price IS the input. Click the big "$N" → it becomes
// an inline text field → typing updates state. A row of preset
// "tier-name" buttons sets the amount with one click; "Custom" focuses
// the inline editor for any amount above (or below) the presets.
//
// Floor flips $8 → $13 based on the server-rendered `founderEligible`
// prop. The "Pup" preset is hidden once the founder cap fills — the
// label exists but the price would no longer be valid.
//
// After the founder cap fills, the next 100 sign-ups claim a Charter
// slot at the same $13 floor. Charter is a permanent-earned badge
// (mirrors Founder), not a separate price tier — the floor and slider
// behaviour are identical to Regular; the difference is the badge and
// the scarcity copy.

type Plan = "monthly" | "yearly";

type Props = {
  founderEligible: boolean;
  founderClaimed: number;
  /** True when founder cap is exhausted AND charter cap is not yet
      reached. Drives Charter scarcity copy + live preview chip. */
  charterEligible: boolean;
  charterClaimed: number;
  /** Total members ever joined (ZCARD on members:all). Surfaced as a
      single line beneath the subscribe button — social proof at the
      moment of decision. Renders only when > 0. */
  totalMembers: number;
  /** Single-use private founder token. When set, the page has unlocked
      the founder floor via /membership?access=<token>; it rides along
      in the checkout POST so the server can re-validate + grant. */
  accessToken?: string;
  /** True on the private founder link. Keeps the founder floor + #101
      badge preview but swaps the public "X of 100 slots left" line for
      a private-grant line. */
  privateFounderAccess?: boolean;
};

const FOUNDER_MONTHLY_CENTS = 800;
const FOUNDER_YEARLY_CENTS = 8000;
const REGULAR_MONTHLY_CENTS = 1300;
const REGULAR_YEARLY_CENTS = 13000;

// Preset tier amounts. The bottom two ($8, $13) are baselines — they
// show only the dollar amount with no label. The top three are public
// badge tiers: paying at that level earns a HUNTER / OPERATOR /
// APEX badge visible across the site.
type Preset = {
  /** Stable identifier — used as a React key and for matching. The
      label that renders to users lives on `label`. */
  key: "pup" | "pack" | "hunter" | "operator" | "apex";
  label: string;
  monthlyCents: number;
  /** True when this preset requires founder eligibility (the $8 tier). */
  founderOnly?: boolean;
};

const PRESETS: Preset[] = [
  { key: "pup", label: "", monthlyCents: 800, founderOnly: true },
  { key: "pack", label: "", monthlyCents: 1300 },
  { key: "hunter", label: "Hunter", monthlyCents: 2500 },
  { key: "operator", label: "Operator", monthlyCents: 5000 },
  { key: "apex", label: "Apex", monthlyCents: 10000 },
];

// Tier-badge thresholds, expressed in monthly-equivalent cents. Yearly
// pricing is monthly × 10, so the yearly $ amount divided by 10 maps
// to the same thresholds. Custom amounts map by these same thresholds
// (a $35 custom contribution still earns HUNTER).
const HUNTER_MONTHLY = 2500;
const OPERATOR_MONTHLY = 5000;
const APEX_MONTHLY = 10000;
const STANDARD_MONTHLY = 1300;

function monthlyEquivalentCents(cents: number, plan: Plan): number {
  return plan === "monthly" ? cents : Math.round(cents / 10);
}

/**
 * Tier badge a member would qualify for at the given amount. Mirrors
 * `getTierBadge` in lib/members.ts but driven by raw cents (no record
 * yet — the preview reflects the *future* member). Returns null below
 * HUNTER threshold; founder status is handled separately.
 */
function previewTierBadge(cents: number, plan: Plan): TierBadge | null {
  const monthly = monthlyEquivalentCents(cents, plan);
  if (monthly >= APEX_MONTHLY) return "apex";
  if (monthly >= OPERATOR_MONTHLY) return "operator";
  if (monthly >= HUNTER_MONTHLY) return "hunter";
  return null;
}

/**
 * Single line of copy below the big price. Derived from the selected
 * monthly-equivalent amount + founder/charter eligibility so a custom
 * $35 still gets the HUNTER pitch, not a "regular tier" placeholder.
 */
function describeAmount(
  cents: number,
  plan: Plan,
  founderEligible: boolean,
  founderRemaining: number,
  charterEligible: boolean,
  charterRemaining: number,
  privateFounderAccess: boolean
): string {
  const monthly = monthlyEquivalentCents(cents, plan);
  // Founder rate: only when the user is below the standard floor AND
  // founder slots are still open. A founder choosing $25+ gets the
  // tier description instead — they'll still receive the founder slot
  // (handled in the webhook) but the per-tier line is what's surfaced
  // here.
  if (founderEligible && monthly < STANDARD_MONTHLY) {
    // Private founder link: there's no public slot counter to quote —
    // it's an honored one-off, not the open cohort.
    if (privateFounderAccess) {
      return "founder rate. locked for life. name your price above $8.";
    }
    return `founder rate. locked for life. ${founderRemaining} of 100 ${
      founderRemaining === 1 ? "slot" : "slots"
    } left.`;
  }
  // Charter window: founder is filled, charter is still open, user is
  // at the standard floor. Same shape as the founder line so the
  // scarcity register reads consistent.
  if (charterEligible && monthly === STANDARD_MONTHLY) {
    return `charter rate. badge locked for life. ${charterRemaining} of 100 ${
      charterRemaining === 1 ? "slot" : "slots"
    } left.`;
  }
  if (monthly >= APEX_MONTHLY) {
    return "APEX badge. the top of the order.";
  }
  if (monthly >= OPERATOR_MONTHLY) {
    return "OPERATOR badge. higher rank, visible everywhere you post.";
  }
  if (monthly >= HUNTER_MONTHLY) {
    return "HUNTER badge displayed next to your name in comments and the Lounge.";
  }
  return "standard membership. full access. cancel anytime.";
}

function floorFor(plan: Plan, founderEligible: boolean): number {
  if (founderEligible) {
    return plan === "monthly" ? FOUNDER_MONTHLY_CENTS : FOUNDER_YEARLY_CENTS;
  }
  return plan === "monthly" ? REGULAR_MONTHLY_CENTS : REGULAR_YEARLY_CENTS;
}

function presetCentsFor(preset: Preset, plan: Plan): number {
  return plan === "monthly" ? preset.monthlyCents : preset.monthlyCents * 10;
}

function formatDollars(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDollarsBody(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2);
}

export function MembershipPlans({
  founderEligible,
  founderClaimed,
  charterEligible,
  charterClaimed,
  totalMembers,
  accessToken,
  privateFounderAccess = false,
}: Props) {
  const [plan, setPlan] = useState<Plan>("monthly");
  const [cents, setCents] = useState<number>(() =>
    floorFor("monthly", founderEligible)
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const floor = floorFor(plan, founderEligible);

  function changePlan(next: Plan) {
    if (next === plan) return;
    const scaled =
      next === "yearly" ? cents * 10 : Math.round(cents / 10);
    const newFloor = floorFor(next, founderEligible);
    setCents(Math.max(newFloor, scaled));
    setPlan(next);
  }

  function startEdit() {
    setDraft(formatDollarsBody(cents));
    setEditing(true);
  }

  function commitEdit() {
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n > 0) {
      const c = Math.round(n * 100);
      setCents(Math.max(floor, c));
    }
    setEditing(false);
    setDraft("");
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
  }

  function selectPreset(preset: Preset) {
    setCents(presetCentsFor(preset, plan));
    // Make sure we're not in edit mode after a preset click — the
    // big number should display the new value cleanly.
    if (editing) {
      setEditing(false);
      setDraft("");
    }
  }

  function selectCustom() {
    // "Custom" preset focuses the inline editor so the user can type
    // a number above or below the named tiers without a separate UI.
    startEdit();
    // Focus is set via autoFocus on the input itself once it mounts.
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/membership/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          amountCents: cents,
          ...(accessToken ? { accessToken } : {}),
        }),
      });
      const data: {
        url?: string;
        error?: string;
        floor?: number;
      } = await res.json();

      if (!res.ok || !data.url) {
        if (data.error === "below_floor" && typeof data.floor === "number") {
          setError(`minimum is ${formatDollars(data.floor)} now.`);
          setCents(data.floor);
        } else if (data.error === "stripe_not_configured") {
          setError("membership isn't live yet. check back shortly.");
        } else {
          setError(data.error ?? "checkout_failed");
        }
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "checkout_failed");
      setLoading(false);
    }
  }

  const intervalLabel = plan === "monthly" ? "/mo" : "/yr";
  const billingLine =
    plan === "monthly"
      ? "billed monthly. cancel anytime."
      : "billed annually. two months on the house.";
  const remaining = Math.max(0, 100 - founderClaimed);
  const charterRemaining = Math.max(0, 100 - charterClaimed);
  const tierLine = describeAmount(
    cents,
    plan,
    founderEligible,
    remaining,
    charterEligible,
    charterRemaining,
    privateFounderAccess
  );

  const visiblePresets = PRESETS.filter(
    (p) => founderEligible || !p.founderOnly
  );
  const matchedPreset = visiblePresets.find(
    (p) => presetCentsFor(p, plan) === cents
  );
  const inputWidthCh = Math.max(2, (draft.length || 1) + 0.5);

  const onCustom = !matchedPreset && !editing;

  /* === Live badge preview =====================================
     Tier badge derives from the current amount. Founder/Charter
     badge fires while their respective slots are still open AND
     the user is at a paid floor (any positive cents qualifies —
     paying anything during the window earns the slot). Slot
     number is `claimed + 1` so the preview reads "the slot you'd
     actually claim" rather than a placeholder. Founder takes
     precedence; Charter only previews when Founder is exhausted. */
  const previewTier = previewTierBadge(cents, plan);
  const previewFounderSlot =
    founderEligible && cents > 0 ? founderClaimed + 1 : null;
  const previewCharterSlot =
    !founderEligible && charterEligible && cents > 0
      ? charterClaimed + 1
      : null;
  const previewHasBadge =
    previewTier !== null ||
    previewFounderSlot !== null ||
    previewCharterSlot !== null;

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Cadence toggle */}
      <div
        className="flex border border-ink mb-8"
        role="tablist"
        aria-label="Billing cadence"
      >
        <button
          type="button"
          role="tab"
          aria-selected={plan === "monthly"}
          onClick={() => changePlan("monthly")}
          className={`plan-toggle${
            plan === "monthly" ? " plan-toggle-active" : ""
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={plan === "yearly"}
          onClick={() => changePlan("yearly")}
          className={`plan-toggle${
            plan === "yearly" ? " plan-toggle-active" : ""
          }`}
        >
          Annual
        </button>
      </div>

      {/* Big editable price. */}
      <div className="text-center mb-7">
        <p
          className="font-display text-ink leading-none mb-3"
          style={{
            fontSize: "clamp(2.75rem, 6vw, 3.75rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <span aria-hidden="true">$</span>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={draft}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                const parts = v.split(".");
                setDraft(
                  parts.length > 1
                    ? `${parts[0]}.${parts.slice(1).join("")}`
                    : v
                );
              }}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              className="pwyw-amount-input"
              style={{
                fontFamily: "inherit",
                fontSize: "inherit",
                fontWeight: "inherit",
                letterSpacing: "inherit",
                lineHeight: "inherit",
                color: "inherit",
                width: `${inputWidthCh}ch`,
              }}
              aria-label="Your contribution amount"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="pwyw-amount-button"
              style={{
                fontFamily: "inherit",
                fontSize: "inherit",
                fontWeight: "inherit",
                letterSpacing: "inherit",
                lineHeight: "inherit",
                color: "inherit",
              }}
              aria-label={`Set your contribution. Current: ${formatDollars(
                cents
              )}${intervalLabel}. Click to edit.`}
            >
              {formatDollarsBody(cents)}
            </button>
          )}
          <span
            className="font-serif italic text-ink-muted"
            style={{
              fontSize: "1rem",
              fontWeight: 400,
              letterSpacing: 0,
              marginLeft: "0.4rem",
            }}
          >
            {intervalLabel}
          </span>
        </p>
        <p
          className="font-serif italic text-ink-muted"
          style={{ fontSize: "0.92rem" }}
        >
          {tierLine}
        </p>
        <p className="text-xs italic text-ink-faint mt-1">{billingLine}</p>
      </div>

      {/* One-line clarity copy above the selector — explains that
          the membership doesn't change between tiers, just the badge.
          Small, italic, prestige register; not a hard banner. */}
      <p
        className="font-serif italic text-ink-muted text-center mb-3"
        style={{ fontSize: "0.82rem", letterSpacing: "0.01em" }}
      >
        every tier gets the same membership.{" "}
        <span className="whitespace-nowrap">
          tiers above $13 add a public badge.
        </span>
      </p>

      {/* Preset buttons. Grid keeps them centered on mobile; flex on
          desktop wraps gracefully without exotic responsive math. */}
      <div
        className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-8"
        role="group"
        aria-label="Preset contribution tiers"
      >
        {visiblePresets.map((preset) => {
          const presetCents = presetCentsFor(preset, plan);
          const active = matchedPreset?.key === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => selectPreset(preset)}
              className={`preset-pill${active ? " preset-pill-active" : ""}`}
              aria-pressed={active}
            >
              <span className="preset-pill-amount">
                {formatDollars(presetCents)}
              </span>
              {/* Always render the label slot so all five pills share
                  the same height — the baseline tiers ($8 / $13) just
                  use a non-breaking space placeholder. */}
              <span className="preset-pill-label">
                {preset.label || " "}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={selectCustom}
          className={`preset-pill${onCustom ? " preset-pill-active" : ""}`}
          aria-pressed={onCustom}
        >
          <span className="preset-pill-amount">—</span>
          <span className="preset-pill-label">Custom</span>
        </button>
      </div>

      {/* === Live preview =====================================
          A miniature comment card showing how the member's name +
          badge will appear in the site's comment / lounge chrome.
          Updates as the selected tier changes. Shows even at the
          $13 / no-badge case (a no-chip preview makes the contrast
          obvious when the user toggles up to $25+). */}
      <div className="badge-preview mb-8" aria-live="polite">
        <p className="eyebrow mb-3" style={{ textAlign: "center" }}>
          Preview
        </p>
        <div className="badge-preview-card">
          <span
            aria-hidden="true"
            className="badge-preview-avatar"
          >
            Y
          </span>
          <div className="badge-preview-body">
            <div className="badge-preview-header">
              <span className="badge-preview-name">Your Name</span>
              {previewHasBadge ? (
                <MemberBadge
                  founderSlot={previewFounderSlot}
                  charterSlot={previewCharterSlot}
                  tierBadge={previewTier}
                  size="small"
                />
              ) : (
                <span className="badge-preview-no-badge">no badge</span>
              )}
            </div>
            <p className="badge-preview-text">
              the way your name appears in comments and the lounge.
            </p>
          </div>
        </div>
      </div>

      {/* Subscribe */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || cents < floor}
        className="btn-primary w-full justify-center"
        style={{
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "wait" : "pointer",
          textAlign: "center",
        }}
      >
        <span>
          {loading
            ? "redirecting..."
            : `subscribe at ${formatDollars(cents)}${intervalLabel}`}
        </span>
      </button>

      {error && (
        <p
          className="text-sm italic mt-4 text-center"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}

      {/* Social proof tucked under the CTA — the same total reader
          count the scarcity strip shows up top, rendered here as a
          quiet italic line so it reinforces at the decision moment
          without competing with the button. */}
      {totalMembers > 0 && (
        <p
          className="font-serif italic text-ink-muted text-center mt-3"
          style={{ fontSize: "0.88rem" }}
        >
          join {totalMembers} {totalMembers === 1 ? "reader" : "readers"} inside.
        </p>
      )}
    </div>
  );
}
