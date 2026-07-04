import { addMonths, type GiftTermMonths } from "./gifts";
import { saveMember, type MemberRecord } from "./members";
import { REGULAR_MONTHLY_FLOOR_CENTS, baseUrl } from "./membership";
import { applyMembersTag } from "./kit";
import { createNotification } from "./notifications";
import {
  markFundClaimed,
  markRequestGranted,
  type PoolRequest,
} from "./pool";
import { createMagicLink } from "./auth";
import { sendPoolSeatClaimedEmail, sendPoolWelcomeEmail } from "./email";
import { recordEvent } from "./analytics";

// Shared "mint a prepaid seat" path for the two donor-funded lanes: a
// redeemed named gift (lib/gifts.ts) and a claimed community-pool seat
// (lib/pool.ts). Both grant the SAME thing — a regular tier membership
// that stays active until a prepaid term expires, backed by no Stripe
// subscription. Pulled out of the gift redeem route so the two lanes
// can't drift apart.
//
// amountCents is pinned to the $13 regular monthly floor (NOT the
// one-time donor charge) so the derived tier badges (hunter/operator/
// apex, which read amount + interval) never light up off a gift. The
// real money lives on the gift/fund record. A returning lapsed member
// keeps their original createdAt and avatar.
//
// This does NOT send the sign-in / welcome email — each lane sends its
// own voice (gift vs pool). Caller mints the magic link off the returned
// record.stripeCustomerId.

type GrantSource =
  | { kind: "gift"; giftId: string }
  | { kind: "pool"; fundId: string };

export async function grantPrepaidSeat(args: {
  email: string;
  termMonths: GiftTermMonths;
  source: GrantSource;
  /** Existing record for a returning lapsed member, to preserve join
      date + avatar. Pass null/undefined for a brand-new seat. */
  existing?: MemberRecord | null;
  notification: { title: string; body: string; linkUrl?: string };
}): Promise<{ record: MemberRecord; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = addMonths(now, args.termMonths);

  // Synthetic Stripe ids namespaced by lane keep the customer-id reverse
  // index unique and make the seat's origin readable at a glance.
  const synthetic =
    args.source.kind === "gift"
      ? `gift_${args.source.giftId}`
      : `pool_${args.source.fundId}`;

  const record: MemberRecord = {
    email: args.email,
    stripeCustomerId: synthetic,
    stripeSubscriptionId: synthetic,
    tier: "regular",
    founderSlot: null,
    charterSlot: null,
    status: "active",
    interval: "month",
    amountCents: REGULAR_MONTHLY_FLOOR_CENTS,
    createdAt: args.existing?.createdAt ?? now,
    updatedAt: now,
    customAvatarUrl: args.existing?.customAvatarUrl ?? null,
    giftExpiresAt: expiresAt,
    viaGiftId: args.source.kind === "gift" ? args.source.giftId : null,
    viaPoolFundId: args.source.kind === "pool" ? args.source.fundId : null,
  };
  await saveMember(record);

  // Kit "Members" tag, same non-fatal posture as the membership webhook.
  const kit = await applyMembersTag(args.email);
  if (!kit.ok) {
    console.warn(
      `[seat-grant] kit tag failed for ${args.email}: ${kit.reason}${
        kit.status ? ` (${kit.status})` : ""
      }`
    );
  }

  await createNotification({
    memberEmail: args.email,
    type: "founder_confirmed",
    title: args.notification.title,
    body: args.notification.body,
    linkUrl: args.notification.linkUrl ?? "/desk",
  }).catch((err) => {
    console.error(
      `[seat-grant] welcome notification failed for ${args.email}:`,
      err
    );
  });

  return { record, expiresAt };
}

/**
 * Finish granting a community-pool seat to a confirmed claimer: mint the
 * membership, stamp the fund + request as claimed, count it, and send
 * the welcome email carrying the first sign-in link. Shared by the
 * confirm route (claimer acting now) and the webhook (a funded seat
 * handed to the front waiter). Callers do their own eligibility +
 * seat-bookkeeping first; this is the common tail.
 */
export async function finalizePoolGrant(args: {
  request: PoolRequest;
  fundId: string;
  termMonths: GiftTermMonths;
  existing?: MemberRecord | null;
  /** Defaults to the welcome copy; the webhook overrides with "a seat
      opened for you" framing. DRAFT copy either way. */
  notification?: { title: string; body: string; linkUrl?: string };
  /** Email the funder that their seat was claimed. Default true — this is
      the loop-closer for the claimer-acts-first path. The webhook's
      immediate-match path passes false, since the funder gets the fund
      thank-you email moments later for the very same seat. */
  notifyFunderClaimed?: boolean;
}): Promise<number> {
  const termLabel = args.termMonths === 3 ? "3 months" : "1 year";
  const { record, expiresAt } = await grantPrepaidSeat({
    email: args.request.email,
    termMonths: args.termMonths,
    source: { kind: "pool", fundId: args.fundId },
    existing: args.existing,
    notification: args.notification ?? {
      // DRAFT copy — Clay finalizes.
      title: "Someone covered your seat.",
      body: "You're in. Click for your member home.",
      linkUrl: "/desk",
    },
  });
  const claimedFund = await markFundClaimed(args.fundId, args.request.id);
  await markRequestGranted(args.request.id, {
    seatFundId: args.fundId,
    termMonths: args.termMonths,
    membershipExpiresAt: expiresAt,
  });
  await recordEvent("pool_claimed", { source: "pool" });

  // Close the loop: tell the funder their seat landed, so a one-time gift
  // becomes a repeat one. Anonymous both ways — the email never hints at
  // the claimer. Suppressed on the webhook immediate-match path, where the
  // fund thank-you email already covers this same seat.
  if ((args.notifyFunderClaimed ?? true) && claimedFund?.buyerEmail) {
    await sendPoolSeatClaimedEmail({
      to: claimedFund.buyerEmail,
      termLabel,
    }).catch((err) => {
      console.error(
        `[pool] seat-claimed email failed for ${claimedFund.buyerEmail}:`,
        err
      );
    });
  }

  // First sign-in link, dispatched automatically (mirrors gift redeem).
  const linkId = await createMagicLink({
    email: args.request.email,
    customerId: record.stripeCustomerId,
    next: "/desk",
  });
  if (linkId) {
    const url = `${baseUrl()}/api/auth/callback?token=${encodeURIComponent(linkId)}`;
    const sent = await sendPoolWelcomeEmail({
      to: args.request.email,
      termLabel,
      signInUrl: url,
    });
    if (!sent.ok) {
      console.error(
        `[pool] welcome email failed for ${args.request.email}: ${sent.error}. Sign-in link: ${url}`
      );
    }
  } else {
    console.error(
      `[pool] createMagicLink returned null for ${args.request.email}`
    );
  }

  return expiresAt;
}
