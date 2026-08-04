import Stripe from "stripe";
import type { NextRequest } from "next/server";
import {
  createEntry,
  formatAttribution,
  isStorageConfigured,
  type AttributionPreference,
} from "@/lib/supporters";
import {
  createDonation,
  isStorageConfigured as isWallStorageConfigured,
} from "@/lib/wallDonations";
import { getWallBySlug } from "@/lib/walls";
import { notifyNewWallDonation } from "@/lib/email";
import { consumeFounderAccess } from "@/lib/founder-access";
import {
  claimCharterSlot,
  claimFounderSlot,
  getMember,
  getMemberByCustomerId,
  getMemberBySessionId,
  hasActiveGiftSeat,
  saveMember,
  updateMemberStatus,
  updateMemberSubscription,
  writeSessionIndex,
  type MemberRecord,
  type MemberSubscriptionStatus,
  type Tier,
} from "@/lib/members";
import { applyMembersTag, subscribeToList } from "@/lib/kit";
import { assignDefaultDisplayName, getProfile, isAdmin } from "@/lib/comments";
import { splitFullName } from "@/lib/display-name";
import {
  finalizePaidComment,
  getPaidCommentIdByCheckoutSession,
} from "@/lib/paid-comments";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { getAllCaseFiles } from "@/lib/case-files";
import { sendPendingCommentNotification } from "@/lib/email";
import { baseUrl } from "@/lib/membership";
import {
  anonymizationLabel,
  getIdByCheckoutSession,
  getSubmission,
  markPaid,
} from "@/lib/case-submissions";
import {
  sendBillingAdminAlert,
  sendCaseReviewAdminNotification,
  sendCaseReviewMemberConfirmation,
  sendMembershipLapsedEmail,
  sendPaymentFailedEmail,
} from "@/lib/email";
import {
  claimFailureStage,
  claimLapse,
  clearInvoiceDunning,
} from "@/lib/dunning";
import { createNotification } from "@/lib/notifications";
import { signBillingToken } from "@/lib/auth";
import { asTrackChannel, asTrackSource, recordEvent } from "@/lib/analytics";
import {
  getGift,
  getGiftByRecipient,
  getGiftBySessionId,
  markGiftPaid,
  updateGift,
} from "@/lib/gifts";
import {
  addToPot,
  createFundedPoolSeat,
  getPoolContribution,
  getPoolContributionBySession,
  getPoolFund,
  getPoolFundBySession,
  getPoolRequest,
  markContributionPaid,
  markPoolFunded,
  placeFundedSeat,
  POOL_SEAT_FILL_PRICE_CENTS,
  POOL_SEAT_FILL_TERM_MONTHS,
  releaseFundedSeat,
  setContributionSeatsMinted,
} from "@/lib/pool";
import { finalizePoolGrant } from "@/lib/seat-grants";
import { emailHasActiveMembership } from "@/lib/membership";
import {
  sendGiftEmail,
  sendGiftSelfRefundEmail,
  sendPoolContributionThankYouEmail,
  sendPoolFundThankYouEmail,
} from "@/lib/email";

export const runtime = "nodejs";

// Lazy init: constructing Stripe at module load throws when the key is
// absent (e.g. during the build's page-data collection), so defer it.
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return stripeClient;
}

const allowedAttribution = new Set<AttributionPreference>([
  "full",
  "first_last_initial",
  "first",
  "anonymous",
]);

function parseAttribution(value: string | undefined): AttributionPreference {
  if (value && allowedAttribution.has(value as AttributionPreference)) {
    return value as AttributionPreference;
  }
  return "first";
}

/* --- Dunning labels -------------------------------------------------
   Dates come off Stripe as unix seconds and get read by humans in
   Clay's timezone, so they're rendered in Eastern rather than whatever
   the serverless region happens to be. */

function formatBillingDate(unixSeconds: number | null): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function formatMemberSince(msEpoch: number | undefined): string {
  if (!msEpoch) return "unknown";
  return new Date(msEpoch).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

/** "founder #12" / "charter #27" / "regular", for the admin alert. */
function tierLabelOf(member: MemberRecord): string {
  if (member.tier === "founder" && member.founderSlot) {
    return `founder #${member.founderSlot}`;
  }
  if (member.tier === "charter" && member.charterSlot) {
    return `charter #${member.charterSlot}`;
  }
  return member.tier;
}

function amountLabelOf(member: MemberRecord): string {
  if (typeof member.amountCents !== "number") return "amount unknown";
  const dollars = member.amountCents / 100;
  const rendered = Number.isInteger(dollars)
    ? String(dollars)
    : dollars.toFixed(2);
  return `$${rendered}/${member.interval === "year" ? "yr" : "mo"}`;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return new Response("Stripe webhook is not configured.", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header.", { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  // Dispatch by event type. Tip + wall + membership all fork off the
  // same checkout.session.completed event; subscription lifecycle
  // events are membership-only and live in their own branches.
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? {};

      // Origin guard. SBP and readsowell.com share one Stripe account, so
      // this endpoint also receives readsowell's events. readsowell stamps
      // `site: 'readsowell'`; reject anything marked as another site so a
      // readsowell tip can never land in SBP's stores. Legacy SBP events
      // (created before the marker shipped) have no `site` and pass through.
      if (metadata.site && metadata.site !== "sbp") {
        return new Response("ok", { status: 200 });
      }

      if (
        typeof metadata.wall_slug === "string" &&
        metadata.wall_slug.length > 0
      ) {
        return handleWallDonation(session, metadata);
      }
      if (metadata.lane === "membership") {
        return handleMembershipCheckout(session, metadata);
      }
      if (metadata.lane === "case_review") {
        return handleCaseReviewCheckout(session, metadata);
      }
      if (metadata.lane === "paid_comment") {
        return handlePaidCommentCheckout(session, metadata);
      }
      if (metadata.lane === "gift") {
        return handleGiftCheckout(session, metadata);
      }
      if (metadata.lane === "pool") {
        return handlePoolFunding(session, metadata);
      }
      if (metadata.lane === "pool_contribution") {
        return handlePoolContribution(session, metadata);
      }
      return handleTipDonation(session, metadata);
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      if (customerId) {
        // Read before the status flip so we can tell a card that died
        // from a member who chose to leave.
        const member = await getMemberByCustomerId(customerId).catch(
          () => null
        );
        await updateMemberStatus(customerId, "canceled");

        // A seat that died at the end of a failed retry window used to
        // end in total silence. Send one win-back, claimed on the
        // subscription id so a member who reactivates and lapses again
        // later still gets one. Voluntary cancels are left alone: they
        // decided, and "your card never cleared" would be a lie.
        const diedOnPayment =
          sub.cancellation_details?.reason === "payment_failed" ||
          member?.status === "past_due" ||
          member?.status === "unpaid";

        if (member && diedOnPayment && (await claimLapse(sub.id))) {
          const profile = await getProfile(member.email).catch(() => null);
          const displayName =
            profile?.displayName?.trim() || member.email.split("@")[0] || "";
          const base = (
            process.env.NEXT_PUBLIC_BASE_URL ?? "https://stopbeingprey.com"
          ).replace(/\/$/, "");
          // Prefill the address so the win-back is one click, not a
          // form to fill out at the exact moment they're least invested.
          const reactivateUrl = `${base}/reactivate?email=${encodeURIComponent(
            member.email
          )}`;
          await sendMembershipLapsedEmail({
            to: member.email,
            memberDisplayName: displayName,
            reactivateUrl,
          }).catch((err) => {
            console.error(
              `[email] membership-lapsed send threw for ${member.email}:`,
              err
            );
          });
        }
      }
      return new Response("ok", { status: 200 });
    }

    case "customer.subscription.updated": {
      // Stripe fires this for any subscription mutation — status flips
      // AND tier upgrades/downgrades through the Customer Portal. We
      // sync amountCents + interval here so the derived tier badge
      // tracks the live subscription without a second round-trip.
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      if (customerId) {
        const item = sub.items.data[0];
        const recurringInterval = item?.price.recurring?.interval;
        const interval: "month" | "year" | undefined =
          recurringInterval === "month" || recurringInterval === "year"
            ? recurringInterval
            : undefined;
        const amountCents =
          typeof item?.price.unit_amount === "number"
            ? item.price.unit_amount
            : undefined;
        await updateMemberSubscription(customerId, {
          status: sub.status as MemberSubscriptionStatus,
          interval,
          amountCents,
        });
      }
      return new Response("ok", { status: 200 });
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(invoice.customer);
      if (customerId) {
        // Status flip is idempotent, so it stays outside the stage gate
        // and tracks every retry.
        await updateMemberStatus(customerId, "past_due");

        // Stripe retries a failed invoice on its own dunning schedule
        // and fires this event on EVERY attempt. Emailing per event sent
        // one member nine identical notices. The stage machine decides
        // which of the three touches this particular attempt earns, and
        // claims it atomically, so retries and webhook redeliveries
        // collapse into exactly one send.
        const nextPaymentAttempt = invoice.next_payment_attempt ?? null;
        const stage = await claimFailureStage({
          invoiceId: invoice.id,
          attemptCount: invoice.attempt_count ?? 1,
          nextPaymentAttempt,
        });
        if (!stage) return new Response("ok", { status: 200 });

        const member = await getMemberByCustomerId(customerId).catch(
          () => null
        );
        if (member) {
          const profile = await getProfile(member.email).catch(() => null);
          const displayName =
            profile?.displayName?.trim() ||
            member.email.split("@")[0] ||
            "";
          const baseUrl = (
            process.env.NEXT_PUBLIC_BASE_URL ?? "https://stopbeingprey.com"
          ).replace(/\/$/, "");
          // No-login recovery link. Many members subscribe purely to
          // support and never sign in — and a past_due member can't even
          // request a fresh sign-in link — so the email must not point at
          // the login-gated /notes/account. This signed token lets them
          // open the Stripe card-update portal in one click, no sign-in.
          const recoveryToken = await signBillingToken(customerId);
          const billingUrl = `${baseUrl}/billing/fix?token=${encodeURIComponent(
            recoveryToken
          )}`;
          const nextAttemptLabel = formatBillingDate(nextPaymentAttempt);

          // The bell only rings on the two stages that carry news. A
          // mid-sequence nudge in the inbox is enough.
          if (stage !== "nudge") {
            await createNotification({
              memberEmail: member.email,
              type: "payment_failed",
              title:
                stage === "final"
                  ? "Last try on your seat"
                  : "Payment didn't go through",
              body:
                stage === "final"
                  ? "No retries left. Update your card to keep the seat and the rate."
                  : "Update your card to keep your founder rate locked in",
              linkUrl: "/notes/account",
            }).catch((err) => {
              console.error(
                `[notifications] payment_failed write failed for ${member.email}:`,
                err
              );
            });
          }

          await sendPaymentFailedEmail({
            to: member.email,
            memberDisplayName: displayName,
            billingUrl,
            stage,
            nextAttemptLabel,
          }).catch((err) => {
            console.error(
              `[email] payment-failed send threw for ${member.email}:`,
              err
            );
          });

          // Ping Clay at the two moments a personal note still turns a
          // churn around: the day the card first fails, and the day
          // Stripe burns its last retry.
          if (stage === "first" || stage === "final") {
            await sendBillingAdminAlert({
              to: process.env.ADMIN_EMAIL ?? "clay@stopbeingprey.com",
              stage,
              memberEmail: member.email,
              memberName: displayName,
              tierLabel: tierLabelOf(member),
              amountLabel: amountLabelOf(member),
              memberSinceLabel: formatMemberSince(member.createdAt),
              attemptCount: invoice.attempt_count ?? 1,
              nextAttemptLabel,
              stripeCustomerId: customerId,
            }).catch((err) => {
              console.error(
                `[email] billing admin alert threw for ${member.email}:`,
                err
              );
            });
          }
        }
      }
      return new Response("ok", { status: 200 });
    }

    case "invoice.paid": {
      // Subsequent renewal succeeded. Lift past_due back to active if
      // the member was previously delinquent; otherwise this is a
      // no-op (the record was already active from checkout).
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = customerIdOf(invoice.customer);
      if (customerId) {
        const existing = await getMemberByCustomerId(customerId);
        if (existing && existing.status !== "active") {
          await updateMemberStatus(customerId, "active");
        }
      }
      // Wipe the sequence for an invoice that finally cleared, so a
      // renewal failure months from now opens with the soft notice
      // instead of picking up mid-escalation.
      await clearInvoiceDunning(invoice.id).catch(() => {});
      return new Response("ok", { status: 200 });
    }

    default:
      return new Response("ok", { status: 200 });
  }
}

function customerIdOf(
  ref: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.id;
}

/* === Membership ============================================ */

async function handleMembershipCheckout(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  // Idempotency: Stripe retries the same event on transient failures.
  // The session id index is the load-bearing dedupe key — if we've
  // already processed this session, skip the slot-claim path entirely.
  const existing = await getMemberBySessionId(session.id);
  if (existing) {
    return new Response("ok", { status: 200 });
  }

  const email =
    session.customer_details?.email ?? session.customer_email ?? null;
  const customerId = customerIdOf(session.customer);
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!email || !customerId || !subscriptionId) {
    console.error(
      `[membership] webhook missing email/customer/subscription on session ${session.id}`
    );
    // 5xx so Stripe retries — a malformed-but-recoverable event (transient
    // Stripe API blip, partial payload) is worth a few retries before we
    // give up. Stripe stops retrying after several days anyway.
    return new Response("missing fields", { status: 500 });
  }

  // Admin guard: the editor is a separate level, never a paying
  // member. If the admin email somehow ran through Checkout (manual
  // test, accidental click), refuse to write a member record or claim
  // a founder slot. The Stripe subscription still exists; cancel and
  // refund manually via the Dashboard.
  if (isAdmin(email)) {
    console.warn(
      `[membership] admin email ${email} ran through Checkout (session ${session.id}); skipping member record + slot claim. Cancel + refund in Stripe Dashboard.`
    );
    return new Response("ok", { status: 200 });
  }

  // Atomic founder/charter slot claim. The page rendered "founder/charter
  // eligible" at some point in the past; between then and now another
  // buyer may have taken the last slot. claim*Slot returns null when the
  // cap is filled and we stamp Regular instead. Founder takes precedence:
  // if a buyer races past the founder cap, they fall through to charter
  // (or regular if charter is also full).
  const tierAtCheckout: Tier =
    metadata.tier_at_checkout === "founder"
      ? "founder"
      : metadata.tier_at_checkout === "charter"
        ? "charter"
        : "regular";

  // Honored one-off founder grant (e.g. Founder #101) carried by a
  // validated private access token. When present, assign the explicit
  // number directly and DO NOT call claimFounderSlot / touch the founder
  // counter — the public "100 of 100" cohort stays full and
  // isFounderEligible stays false.
  const founderGrantRaw = metadata.founder_slot_grant;
  const founderGrant =
    typeof founderGrantRaw === "string" ? parseInt(founderGrantRaw, 10) : NaN;

  let tier: Tier = "regular";
  let founderSlot: number | null = null;
  let charterSlot: number | null = null;
  if (metadata.reactivation === "true") {
    // Reactivation: restore the member's prior standing rather than
    // claiming a fresh slot. The whole point is that a lapsed founder
    // returns at their locked rate with their original founder number
    // intact — never re-run the (now-full) slot claim, which would drop
    // them to charter/regular.
    const priorForTier = await getMember(email).catch(() => null);
    tier = priorForTier?.tier ?? "regular";
    founderSlot = priorForTier?.founderSlot ?? null;
    charterSlot = priorForTier?.charterSlot ?? null;
  } else if (
    tierAtCheckout === "founder" &&
    Number.isFinite(founderGrant) &&
    founderGrant > 0
  ) {
    tier = "founder";
    founderSlot = founderGrant;
  } else if (tierAtCheckout === "founder") {
    const slot = await claimFounderSlot();
    if (slot !== null) {
      tier = "founder";
      founderSlot = slot;
    } else {
      // Lost the founder race. Try charter next — the buyer intended
      // to be among the early-loyalty cohort and the next slot type
      // honours that intent without dropping them to plain Regular.
      const charter = await claimCharterSlot();
      if (charter !== null) {
        tier = "charter";
        charterSlot = charter;
      }
    }
  } else if (tierAtCheckout === "charter") {
    const slot = await claimCharterSlot();
    if (slot !== null) {
      tier = "charter";
      charterSlot = slot;
    }
  }

  // Pull the live interval + unit_amount off the subscription. Falls
  // back to the metadata + session amount_total if Stripe is briefly
  // unreachable; the record is corrected on the next subscription
  // event in that case.
  let status: MemberSubscriptionStatus = "active";
  let interval: "month" | "year" =
    metadata.plan === "yearly" ? "year" : "month";
  let amountCents = session.amount_total ?? 0;

  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    status = sub.status as MemberSubscriptionStatus;
    const item = sub.items.data[0];
    if (item?.price.recurring?.interval === "month" || item?.price.recurring?.interval === "year") {
      interval = item.price.recurring.interval;
    }
    if (typeof item?.price.unit_amount === "number") {
      amountCents = item.price.unit_amount;
    }
  } catch (err) {
    console.warn(
      `[membership] subscription retrieve failed for ${subscriptionId}:`,
      err
    );
  }

  // A prior record exists when a gifted recipient converts (or a
  // lapsed member re-subscribes). Preserve their join date + avatar;
  // the gift fields are intentionally dropped — the subscription is
  // now the source of access.
  const prior = await getMember(email).catch(() => null);

  const now = Date.now();
  const record: MemberRecord = {
    email,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    tier,
    founderSlot,
    charterSlot,
    status,
    interval,
    amountCents,
    createdAt: prior?.createdAt ?? now,
    updatedAt: now,
    customAvatarUrl: prior?.customAvatarUrl ?? null,
  };

  await saveMember(record);
  await writeSessionIndex(session.id, email);

  // Funnel close: a new paying member. Credit the surface that sent them
  // (metadata.source, set at checkout-create — e.g. "finisher", "tip"), so
  // the per-source counter shows real paid conversions, not just clicks.
  // Idempotent: the getMemberBySessionId guard above returns early on
  // webhook retries, so this fires once per member. recordEvent never throws.
  await recordEvent("became_member", {
    source: asTrackSource(metadata.source),
    channel: asTrackChannel(metadata.channel),
  });

  // Gift funnel close: if this email ever redeemed a gifted seat, the
  // recipient just converted to paying on their own card. Stamp the
  // gift once (convertedAt guards webhook retries reaching this point
  // and repeat subscriptions) so gift_purchased -> gift_redeemed ->
  // gift_converted reads true end to end.
  const redeemedGift = await getGiftByRecipient(email).catch(() => null);
  if (
    redeemedGift &&
    redeemedGift.status === "redeemed" &&
    !redeemedGift.convertedAt
  ) {
    await updateGift(redeemedGift.id, { convertedAt: now });
    await recordEvent("gift_converted", { source: "gift" });
  }

  // Single-use founder access token: consume it now that the checkout
  // has succeeded, so the private link can't be reused. Non-fatal.
  if (metadata.founder_access_token) {
    await consumeFounderAccess(metadata.founder_access_token, email).catch(
      (err) => {
        console.error(
          `[membership] consumeFounderAccess failed for ${email}:`,
          err
        );
      }
    );
  }

  // Default display name from Stripe customer_details.name. Disambiguates
  // against existing members: "Adam" → "Adam R." → "Adam Reynolds". The
  // function is idempotent: webhook retries with an existing profile are
  // a no-op. Failure here is non-fatal — first-comment flow still lets
  // the member pick their own.
  const stripeName = session.customer_details?.name ?? null;
  const { firstName, lastName } = splitFullName(stripeName);
  const nameResult = await assignDefaultDisplayName({
    email,
    firstName,
    lastName,
  }).catch((err) => {
    console.error(
      `[membership] assignDefaultDisplayName threw for ${email}:`,
      err
    );
    return { ok: false, error: "threw" as const };
  });
  if (!nameResult.ok) {
    console.warn(
      `[membership] default displayName not assigned for ${email}: ${nameResult.error}`
    );
  }

  // Kit: subscribe to the SBP list AND apply the "Members" tag. We do both
  // because the broadcast list and the Members segment are separate in Kit;
  // the tag alone doesn't put them on the list. Failure here is logged but
  // never fatal — a paid member missing from the list is a recoverable
  // problem (reconcile with `npm run members:sync-kit`), a paid member with
  // no Stripe record on file is not.
  const list = await subscribeToList(email);
  if (!list.ok && list.reason !== "not_configured") {
    console.warn(
      `[membership] kit list-subscribe failed for ${email}: ${list.reason}${
        list.status ? ` (${list.status})` : ""
      }`
    );
  }
  const kit = await applyMembersTag(email);
  if (!kit.ok) {
    if (kit.reason === "not_configured") {
      // Don't bury config errors in silence. If we're in production
      // and the env vars aren't set, the member was charged but never
      // tagged in Kit — Clay needs to know so he can fix env vars +
      // manually tag.
      console.warn(
        `[membership] KIT_API_KEY or KIT_MEMBERS_TAG_ID not set in this environment — ${email} was NOT tagged in Kit. Set both in Vercel + redeploy; tag this member manually for now.`
      );
    } else {
      console.warn(
        `[membership] kit tag failed for ${email}: ${kit.reason}${
          kit.status ? ` (${kit.status})` : ""
        }`
      );
    }
  }

  // In-site welcome notification. Founder + Charter get the slot
  // number; regular tier gets a generic welcome.
  const welcomeTitle =
    tier === "founder" && founderSlot !== null
      ? `You're Founder #${founderSlot}. Welcome.`
      : tier === "charter" && charterSlot !== null
        ? `You're Charter #${charterSlot}. Welcome.`
        : "Welcome to Stop Being Prey.";
  const welcomeBody =
    tier === "founder"
      ? "Your founder rate is locked. Click for your member home."
      : tier === "charter"
        ? "Charter badge locked for life. Click for your member home."
        : "Click for your member home.";
  await createNotification({
    memberEmail: email,
    type: "founder_confirmed",
    title: welcomeTitle,
    body: welcomeBody,
    linkUrl: "/desk",
  }).catch((err) => {
    console.error(
      `[notifications] founder_confirmed write failed for ${email}:`,
      err
    );
  });

  return new Response("ok", { status: 200 });
}

/* === Paid (non-member) comment ============================= */

async function handlePaidCommentCheckout(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  // Idempotency: the by-checkout reverse index points at the draft.
  // Look up by the session id rather than relying on metadata —
  // metadata is authoritative when both are present, but the reverse
  // index survives a metadata roundtrip going stale.
  const sessionId = session.id;
  const fromIndex = await getPaidCommentIdByCheckoutSession(sessionId);
  const commentIdFromMetadata = metadata.comment_id ?? null;
  const commentId = fromIndex ?? commentIdFromMetadata;
  if (!commentId) {
    console.error(
      `[paid-comment] webhook for session ${sessionId} has no comment id in metadata or by-checkout index`
    );
    // 5xx so Stripe retries while the by-checkout index propagates.
    return new Response("missing comment id", { status: 500 });
  }

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const amountCents = session.amount_total ?? 100;

  const finalized = await finalizePaidComment(commentId, {
    stripePaymentIntentId: paymentIntent,
    amountCents,
  });
  if (!finalized) {
    console.warn(
      `[paid-comment] finalize returned null for comment ${commentId} (session ${sessionId})`
    );
    return new Response("ok", { status: 200 });
  }

  // First-time finalization fires the admin pending-comment email so
  // the queue UX matches the member flow. On webhook retries
  // (paymentStatus already paid), skip — finalize() returns the
  // existing record without re-firing side effects.
  if (finalized.paidAt && finalized.paidAt > Date.now() - 60_000) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const pieceTitle =
        finalized.kind === "article"
          ? (getAllArticles().find((x) => x.slug === finalized.slug)?.title ??
            finalized.slug)
          : finalized.kind === "case-file"
            ? (getAllCaseFiles().find((x) => x.slug === finalized.slug)?.title ??
              finalized.slug)
            : (getAllFieldNotes().find((x) => x.slug === finalized.slug)?.title ??
              finalized.slug);
      const piecePath =
        finalized.kind === "article"
          ? `/${finalized.slug}#c-${finalized.id}`
          : finalized.kind === "case-file"
            ? `/case-files/${finalized.slug}#c-${finalized.id}`
            : `/notes/field-notes/${finalized.slug}#c-${finalized.id}`;
      await sendPendingCommentNotification({
        to: adminEmail,
        authorDisplayName: finalized.displayName,
        authorEmail: finalized.email,
        pieceTitle,
        pieceUrl: `${baseUrl()}${piecePath}`,
        queueUrl: `${baseUrl()}/admin/comments`,
        body: finalized.body,
      }).catch((err) => {
        console.error(
          `[paid-comment] admin pending-comment email failed for ${commentId}:`,
          err
        );
      });
    }
  }

  return new Response("ok", { status: 200 });
}

/* === Gift membership (pay it forward) ====================== */

async function handleGiftCheckout(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  // Resolve the gift: metadata first, by-session reverse index as the
  // fallback (the checkout route writes both).
  const giftId =
    metadata.gift_id && metadata.gift_id.length > 0
      ? metadata.gift_id
      : (await getGiftBySessionId(session.id))?.id ?? null;
  if (!giftId) {
    console.error(
      `[gift] webhook fired without gift_id on session ${session.id}`
    );
    // 5xx so Stripe retries while the reverse index propagates.
    return new Response("missing gift_id", { status: 500 });
  }

  const gift = await getGift(giftId);
  if (!gift) {
    console.error(`[gift] no gift record for ${giftId}`);
    return new Response("no gift record", { status: 500 });
  }

  // Idempotency: Stripe retries the same event on transient failures.
  // Anything past pending means this session was already processed.
  if (gift.status !== "pending") {
    return new Response("ok", { status: 200 });
  }

  const buyerEmail = (
    session.customer_details?.email ??
    session.customer_email ??
    ""
  )
    .toLowerCase()
    .trim();
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Hard guard: no gifting yourself, and the admin never lands in a
  // paid slot even via a gift. Auto-refund so there's no manual
  // cleanup; if the refund call fails Stripe still has the money and
  // the error log tells Clay to refund from the Dashboard.
  if (
    (buyerEmail && buyerEmail === gift.recipientEmail) ||
    isAdmin(gift.recipientEmail)
  ) {
    let refunded = false;
    if (paymentIntentId) {
      try {
        await getStripe().refunds.create({
          payment_intent: paymentIntentId,
        });
        refunded = true;
      } catch (err) {
        console.error(
          `[gift] self-gift auto-refund FAILED for gift ${gift.id} (pi ${paymentIntentId}); refund manually in the Stripe Dashboard:`,
          err
        );
      }
    }
    await updateGift(gift.id, {
      status: "blocked_self",
      buyerEmail: buyerEmail || null,
      stripePaymentIntentId: paymentIntentId,
      paidAt: Date.now(),
    });
    if (buyerEmail) {
      await sendGiftSelfRefundEmail({
        to: buyerEmail,
        membershipUrl: `${baseUrl()}/membership`,
        refunded,
      }).catch((err) => {
        console.error(
          `[gift] self-refund email failed for ${buyerEmail}:`,
          err
        );
      });
    }
    return new Response("ok", { status: 200 });
  }

  const buyerName =
    gift.buyerName || session.customer_details?.name || "A reader";
  const paid = await markGiftPaid(gift.id, {
    buyerEmail: buyerEmail || null,
    buyerName,
    stripePaymentIntentId: paymentIntentId,
  });
  if (!paid || !paid.redemptionToken) {
    console.error(`[gift] markGiftPaid failed for ${gift.id}`);
    // 5xx so Stripe retries; the status is still pending so the retry
    // re-enters this path cleanly.
    return new Response("paid flip failed", { status: 500 });
  }

  await recordEvent("gift_purchased", { source: "gift" });

  const termLabel = paid.termMonths === 3 ? "3 months" : "1 year";
  const redeemUrl = `${baseUrl()}/gift/${encodeURIComponent(paid.redemptionToken)}`;
  const sent = await sendGiftEmail({
    to: paid.recipientEmail,
    buyerName,
    message: paid.message,
    termLabel,
    redeemUrl,
  });
  if (!sent.ok) {
    // The money landed but the invitation didn't. Loud log; the link
    // is recoverable from the gift record, and a webhook retry won't
    // re-fire (status is already paid), so this needs eyes.
    console.error(
      `[gift] gift email send FAILED for ${paid.recipientEmail} (gift ${paid.id}): ${sent.error}. Redemption link: ${redeemUrl}`
    );
  }

  return new Response("ok", { status: 200 });
}

/* === Community seat pool (anonymous pay it forward) ========= */

async function handlePoolFunding(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  // Resolve the fund: metadata first, by-session reverse index as the
  // fallback (the checkout route writes both).
  const fundId =
    metadata.fund_id && metadata.fund_id.length > 0
      ? metadata.fund_id
      : (await getPoolFundBySession(session.id))?.id ?? null;
  if (!fundId) {
    console.error(
      `[pool] webhook fired without fund_id on session ${session.id}`
    );
    return new Response("missing fund_id", { status: 500 });
  }

  const fund = await getPoolFund(fundId);
  if (!fund) {
    console.error(`[pool] no fund record for ${fundId}`);
    return new Response("no fund record", { status: 500 });
  }

  // Idempotency: anything past pending means this session was processed.
  if (fund.status !== "pending") {
    return new Response("ok", { status: 200 });
  }

  const buyerEmail = (
    session.customer_details?.email ??
    session.customer_email ??
    ""
  )
    .toLowerCase()
    .trim();
  const buyerName =
    fund.buyerName || session.customer_details?.name || "A reader";
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const funded = await markPoolFunded(fund.id, {
    buyerEmail: buyerEmail || null,
    buyerName,
    stripePaymentIntentId: paymentIntentId,
  });
  if (!funded) {
    console.error(`[pool] markPoolFunded failed for ${fund.id}`);
    // 5xx so Stripe retries; status is still pending so retry re-enters.
    return new Response("funded flip failed", { status: 500 });
  }

  await recordEvent("pool_funded", { source: "pool" });

  const termLabel = funded.termMonths === 3 ? "3 months" : "1 year";
  const seats = funded.seats && funded.seats > 1 ? funded.seats : 1;

  // Drop each funded seat into the pool: hand it to the front waiter, or
  // park it as available. A matched waiter has already confirmed their
  // email, so it's safe to grant directly here. For a single-seat order
  // the order fund IS the seat; for a multi-seat order we mint N child
  // seats (each a normal single-seat fund) so they're claimed one by one.
  const place = async (seatFundId: string) => {
    const placement = await placeFundedSeat(seatFundId);
    if (placement.kind === "matched") {
      await grantPoolSeatToWaiter(
        placement.requestId,
        seatFundId,
        funded.termMonths
      );
    }
  };

  if (seats <= 1) {
    await place(funded.id);
  } else {
    for (let i = 0; i < seats; i++) {
      const child = await createFundedPoolSeat({
        parentFundId: funded.id,
        termMonths: funded.termMonths,
        amountCents: funded.amountCents,
        buyerEmail: buyerEmail || null,
        buyerName,
        message: funded.message,
      });
      if (child) await place(child.id);
    }
  }

  // Always thank the giver (when Stripe captured an email).
  if (buyerEmail) {
    await sendPoolFundThankYouEmail({ to: buyerEmail, termLabel, seats }).catch(
      (err) => {
        console.error(
          `[pool] fund thank-you email failed for ${buyerEmail}:`,
          err
        );
      }
    );
  }

  return new Response("ok", { status: 200 });
}

/**
 * Grant a just-funded seat to the waitlisted claimer the match script
 * popped. Re-checks eligibility (they may have become a paying member
 * since confirming) and releases the seat back to the pool if so, so a
 * seat is never burned on someone who no longer needs it.
 */
async function grantPoolSeatToWaiter(
  requestId: string,
  fundId: string,
  termMonths: 3 | 12
): Promise<void> {
  const request = await getPoolRequest(requestId);
  if (!request) {
    console.error(`[pool] matched waiter ${requestId} vanished; releasing seat`);
    await releaseFundedSeat(fundId);
    return;
  }

  const existing = await getMember(request.email).catch(() => null);
  const membership = await emailHasActiveMembership(request.email).catch(
    () => ({ active: false, customerId: null })
  );
  if (membership.active || hasActiveGiftSeat(existing) || isAdmin(request.email)) {
    // No longer needs the seat. Put it back in the pool for someone else.
    await releaseFundedSeat(fundId);
    return;
  }

  await finalizePoolGrant({
    request,
    fundId,
    termMonths,
    existing,
    // Funded and claimed in the same instant: the fund thank-you email
    // (sent just after this) already tells the funder. Skip the duplicate.
    notifyFunderClaimed: false,
    notification: {
      // DRAFT copy — Clay finalizes.
      title: "A seat opened for you.",
      body: "Someone funded your seat. Click for your member home.",
      linkUrl: "/desk",
    },
  });
}

/**
 * Chip-in (pot) lane. An open-amount payment lands in the pool pot; the
 * pot mints an anonymous seat each time it crosses a seat's price. Unlike
 * a funded seat there's no single owner, so a pot-minted seat carries no
 * buyerEmail and never triggers the "your seat was claimed" note. The
 * contributor is thanked here instead.
 */
async function handlePoolContribution(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  const contributionId =
    metadata.contribution_id && metadata.contribution_id.length > 0
      ? metadata.contribution_id
      : (await getPoolContributionBySession(session.id))?.id ?? null;
  if (!contributionId) {
    console.error(
      `[pool] contribution webhook fired without contribution_id on session ${session.id}`
    );
    return new Response("missing contribution_id", { status: 500 });
  }

  const contribution = await getPoolContribution(contributionId);
  if (!contribution) {
    console.error(`[pool] no contribution record for ${contributionId}`);
    return new Response("no contribution record", { status: 500 });
  }

  // Idempotency: anything past pending means this session was processed.
  // Guards against a double webhook double-adding to the pot.
  if (contribution.status !== "pending") {
    return new Response("ok", { status: 200 });
  }

  const buyerEmail = (
    session.customer_details?.email ??
    session.customer_email ??
    ""
  )
    .toLowerCase()
    .trim();
  const buyerName =
    contribution.buyerName || session.customer_details?.name || "A reader";
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const paid = await markContributionPaid(contribution.id, {
    buyerEmail: buyerEmail || null,
    buyerName,
    stripePaymentIntentId: paymentIntentId,
  });
  if (!paid) {
    console.error(
      `[pool] markContributionPaid failed for ${contribution.id}`
    );
    // 5xx so Stripe retries; status is still pending so retry re-enters.
    return new Response("contribution flip failed", { status: 500 });
  }

  await recordEvent("pool_contributed", { source: "pool" });

  // Add to the pot atomically; mint one anonymous seat for each whole
  // seat-price the new balance crosses, and drop each into the pool
  // (handed to the front waiter, or parked as available).
  const { minted, potCents } = await addToPot(paid.amountCents);
  for (let i = 0; i < minted; i++) {
    const seat = await createFundedPoolSeat({
      // Trace the seat to the contribution that tipped the pot over.
      parentFundId: paid.id,
      termMonths: POOL_SEAT_FILL_TERM_MONTHS,
      amountCents: POOL_SEAT_FILL_PRICE_CENTS,
      buyerEmail: null,
      buyerName: null,
      message: null,
    });
    if (!seat) {
      console.error(
        `[pool] pot minted a seat but createFundedPoolSeat returned null (contribution ${paid.id})`
      );
      continue;
    }
    const placement = await placeFundedSeat(seat.id);
    if (placement.kind === "matched") {
      await grantPoolSeatToWaiter(
        placement.requestId,
        seat.id,
        POOL_SEAT_FILL_TERM_MONTHS
      );
    }
  }
  if (minted > 0) await setContributionSeatsMinted(paid.id, minted);

  // Thank the giver (when Stripe captured an email).
  if (buyerEmail) {
    await sendPoolContributionThankYouEmail({
      to: buyerEmail,
      amountCents: paid.amountCents,
      seatsMinted: minted,
      potCents,
      seatPriceCents: POOL_SEAT_FILL_PRICE_CENTS,
    }).catch((err) => {
      console.error(
        `[pool] contribution thank-you email failed for ${buyerEmail}:`,
        err
      );
    });
  }

  return new Response("ok", { status: 200 });
}

/* === Tip (existing) ======================================== */

async function handleTipDonation(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  if (metadata.display_publicly !== "true") {
    return new Response("ok", { status: 200 });
  }

  const message = (metadata.donor_message ?? "").trim();
  if (!message) {
    return new Response("ok", { status: 200 });
  }

  if (!isStorageConfigured()) {
    console.warn(
      "[supporters] webhook fired but storage is not configured; skipping write"
    );
    return new Response("ok", { status: 200 });
  }

  const attribution = formatAttribution(
    parseAttribution(metadata.attribution_preference),
    metadata.donor_name,
    metadata.city
  );

  try {
    await createEntry({
      id: session.id,
      timestamp:
        (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
      message,
      attribution,
      source: "stripe",
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[supporters] failed to persist entry: ${reason}`);
    return new Response(`storage error: ${reason}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

/* === Wall (existing) ======================================= */

async function handleWallDonation(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  if (!isWallStorageConfigured()) {
    console.warn(
      "[walls] webhook fired but storage is not configured; skipping write"
    );
    return new Response("ok", { status: 200 });
  }

  const wallSlug = metadata.wall_slug;
  const note = (metadata.note ?? "").trim();
  if (!note) {
    console.warn("[walls] webhook fired without note; skipping write");
    return new Response("ok", { status: 200 });
  }

  const wall = await getWallBySlug(wallSlug);
  if (!wall) {
    console.warn(`[walls] webhook fired for unknown wall: ${wallSlug}`);
    return new Response("ok", { status: 200 });
  }

  const amountCents = session.amount_total ?? 0;

  try {
    const donation = await createDonation({
      id: session.id,
      wallSlug,
      timestamp:
        (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
      name: metadata.donor_name ?? "",
      amountCents,
      note,
      showAmount: metadata.show_amount === "true",
      anonymous: metadata.anonymous === "true",
      stripeSessionId: session.id,
    });
    if (donation) {
      // Fire-and-forget the notification — failure to email shouldn't
      // break the webhook ack.
      await notifyNewWallDonation(donation, wall.title);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[walls] failed to persist donation: ${reason}`);
    return new Response(`storage error: ${reason}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

/* === Case review (paid Case File submission) ============== */

async function handleCaseReviewCheckout(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  // Resolve case id: prefer the metadata, fall back to the reverse
  // index (the API route writes both so a stripped metadata trip
  // doesn't lose the link).
  const caseId =
    metadata.case_id && metadata.case_id.length > 0
      ? metadata.case_id
      : await getIdByCheckoutSession(session.id);

  if (!caseId) {
    console.error(
      `[case-review] webhook fired without case_id on session ${session.id}`
    );
    // 5xx so Stripe retries while the reverse index propagates.
    return new Response("missing case_id", { status: 500 });
  }

  const existing = await getSubmission(caseId);
  if (!existing) {
    console.error(`[case-review] no submission record for ${caseId}`);
    // 5xx so Stripe retries while the submission record propagates.
    return new Response("no submission record", { status: 500 });
  }

  // Idempotency: if we've already processed this case (status past
  // submitted), ack and bail. Stripe retries the same event on
  // transient failures.
  if (existing.status !== "submitted") {
    return new Response("ok", { status: 200 });
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const amountCents = session.amount_total ?? 0;

  const updated = await markPaid(caseId, {
    stripePaymentIntentId: paymentIntentId,
    amountCents,
  });
  if (!updated) {
    // 5xx so Stripe retries on race conditions (record vanished between
    // the read above and the markPaid write).
    return new Response("no submission record", { status: 500 });
  }

  // Fire emails. Failure to email shouldn't fail the webhook (Stripe
  // would retry and we'd send a second confirmation), so we log and
  // ack.
  const adminTo = process.env.ADMIN_EMAIL ?? "clay@stopbeingprey.com";
  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://stopbeingprey.com"
  ).replace(/\/$/, "");
  const caseFilesUrl = `${baseUrl}/case-files`;

  await sendCaseReviewAdminNotification({
    to: adminTo,
    tier: updated.tier,
    amountDollars: Math.round(amountCents / 100),
    memberDisplayName: updated.memberDisplayName,
    memberEmail: updated.memberEmail,
    caseId: updated.id,
    title: updated.title,
    situation: updated.situation,
    move: updated.move,
    attemptedResponse: updated.attemptedResponse,
    helpWanted: updated.helpWanted,
    anonymization: updated.anonymization
      ? anonymizationLabel(updated.anonymization)
      : null,
  }).catch((err) => {
    console.error(
      `[case-review] admin notification failed for ${updated.id}:`,
      err
    );
  });

  await sendCaseReviewMemberConfirmation({
    to: updated.memberEmail,
    memberDisplayName: updated.memberDisplayName,
    tier: updated.tier,
    title: updated.title,
    caseFilesUrl,
  }).catch((err) => {
    console.error(
      `[case-review] member confirmation failed for ${updated.id}:`,
      err
    );
  });

  return new Response("ok", { status: 200 });
}
