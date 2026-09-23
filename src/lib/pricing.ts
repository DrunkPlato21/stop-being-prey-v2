// Pricing floors and the pure math over them.
//
// Split out of lib/membership.ts because the CLIENT needs these too:
// the pay-what-you-want widget has to know the floor to seed its
// amount, disable its button and label its presets. lib/membership.ts
// imports the Stripe SDK and Upstash at module scope, so a client
// component importing the floor from there would drag both into the
// browser bundle. Nothing in this file touches the network.
//
// The prices themselves:
//   Founder   $8/mo   $80/yr   first 100. Closed.
//   Charter   $13/mo  $130/yr  the next 100. The last window at $13.
//   Standard  $18/mo  $180/yr  everyone after. The raise.
//
// The step from Charter to Standard is not a deploy-day flip. Every
// surface derives its floor from LIVE charter eligibility, so the
// moment charter slot 100 is claimed the whole site moves together:
// the copy, the widget, and the server-side floor check at checkout.
// Staging it as a constant swap would open a window where the page
// quotes one price and Stripe bills another, and a buyer inside that
// window would lock the wrong rate for life.
//
// Yearly is exactly 10x monthly at every tier, which is what makes the
// cadence toggle's "two months on the house" literally true.

export type PricingPlan = "monthly" | "yearly";

export const FOUNDER_MONTHLY_FLOOR_CENTS = 800;
export const FOUNDER_YEARLY_FLOOR_CENTS = 8000;

export const CHARTER_MONTHLY_FLOOR_CENTS = 1300;
export const CHARTER_YEARLY_FLOOR_CENTS = 13000;

export const STANDARD_MONTHLY_FLOOR_CENTS = 1800;
export const STANDARD_YEARLY_FLOOR_CENTS = 18000;

// The rate a donor-funded seat converts at, held apart from the public
// floor so the two can move independently.
//
// A pool seat is given to somebody who said they could not afford the
// membership. When their prepaid term ends, the public floor is what
// decides whether they can stay, and raising that floor would aim the
// increase squarely at the people the programme exists for: a reader
// who could not manage $13 is not going to manage $18, and the seat a
// stranger paid for turns into a lapse. So the conversion price is the
// floor that was live when the seat was granted, and it stays here
// when the standard floor rises.
//
// Keep these two in step with whatever the standard floor was at the
// moment of a raise, not with whatever it becomes. The $13 -> $18 raise
// deliberately does not move them.
export const GRANTED_SEAT_MONTHLY_FLOOR_CENTS = 1300;
export const GRANTED_SEAT_YEARLY_FLOOR_CENTS = 13000;

/**
 * The public floor for a buyer who is neither a founder nor converting
 * off a donor seat: the Charter rate while charter slots remain, the
 * standard rate once they are gone. Pure, so client and server share
 * one answer; callers supply the live eligibility.
 */
export function standardFloorCents(
  plan: PricingPlan,
  charterEligible: boolean
): number {
  if (charterEligible) {
    return plan === "monthly"
      ? CHARTER_MONTHLY_FLOOR_CENTS
      : CHARTER_YEARLY_FLOOR_CENTS;
  }
  return plan === "monthly"
    ? STANDARD_MONTHLY_FLOOR_CENTS
    : STANDARD_YEARLY_FLOOR_CENTS;
}

/**
 * The floor for a given buyer, in cents.
 *
 * `charterEligible` defaults false, which is the POST-raise price. A
 * caller that forgets to pass it quotes the higher floor and gets
 * corrected at checkout, rather than silently selling a lifetime lock
 * for less than we meant to charge.
 */
export function floorCentsFor(
  plan: PricingPlan,
  founderEligible: boolean,
  /** True only for a member converting off a donor-funded seat. Checked
      server-side against their own record; never taken from a request. */
  grantedSeat = false,
  /** Live charter eligibility: founder cap full, charter cap not yet. */
  charterEligible = false
): number {
  if (founderEligible) {
    return plan === "monthly"
      ? FOUNDER_MONTHLY_FLOOR_CENTS
      : FOUNDER_YEARLY_FLOOR_CENTS;
  }
  if (grantedSeat) {
    return plan === "monthly"
      ? GRANTED_SEAT_MONTHLY_FLOOR_CENTS
      : GRANTED_SEAT_YEARLY_FLOOR_CENTS;
  }
  return standardFloorCents(plan, charterEligible);
}

/** Whole-dollar label for an amount, for use inside a sentence. */
export function floorLabel(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}
