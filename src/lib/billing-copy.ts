// Plain-English readings of Stripe decline codes.
//
// Shared by the member-facing billing alert and the admin roster so the
// two never drift into describing the same failure differently. The map
// is deliberately short of Stripe's full list: an unmapped code returns
// null and every caller has a vaguer but still true line to fall back
// on. Guessing a specific wrong reason is worse than admitting we only
// know the bank said no.

const DECLINE_REASONS: Record<string, string> = {
  insufficient_funds: "the account was short at the moment it ran",
  expired_card: "the card has expired",
  incorrect_cvc: "the security code didn't match",
  incorrect_number: "the card number didn't check out",
  invalid_expiry_month: "the expiry date didn't check out",
  invalid_expiry_year: "the expiry date didn't check out",
  lost_card: "the bank has the card flagged",
  stolen_card: "the bank has the card flagged",
  pickup_card: "the bank has the card flagged",
  card_velocity_exceeded: "the card hit a bank limit",
  withdrawal_count_limit_exceeded: "the card hit a bank limit",
  processing_error: "the bank hit a processing error",
  try_again_later: "the bank asked us to try again later",
  do_not_honor: "the bank declined it without saying why",
  generic_decline: "the bank declined it without saying why",
  card_declined: "the bank declined it without saying why",
  authentication_required: "the bank wants the payment confirmed directly",
};

/** Member-facing clause, e.g. "the card has expired". Null when unmapped. */
export function describeDecline(code: string | null | undefined): string | null {
  if (!code) return null;
  return DECLINE_REASONS[code] ?? null;
}

/** Terse admin label, e.g. "insufficient funds". Falls back to the raw code. */
export function declineLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return code.replace(/_/g, " ");
}
