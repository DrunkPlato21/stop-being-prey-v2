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
  getMemberByCustomerId,
  getMemberBySessionId,
  saveMember,
  updateMemberStatus,
  updateMemberSubscription,
  writeSessionIndex,
  type MemberRecord,
  type MemberSubscriptionStatus,
  type Tier,
} from "@/lib/members";
import { applyMembersTag } from "@/lib/kit";
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
  sendCaseReviewAdminNotification,
  sendCaseReviewMemberConfirmation,
  sendPaymentFailedEmail,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

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
    event = stripe.webhooks.constructEvent(payload, signature, secret);
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
      return handleTipDonation(session, metadata);
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = customerIdOf(sub.customer);
      if (customerId) await updateMemberStatus(customerId, "canceled");
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
        await updateMemberStatus(customerId, "past_due");
        // Notify + email the member. The renewal usually retries
        // a few times before it hard-fails, but we want them in
        // the loop immediately so they can update the card.
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
          const billingUrl = `${baseUrl}/notes/account`;
          await createNotification({
            memberEmail: member.email,
            type: "payment_failed",
            title: "Payment didn't go through",
            body: "Update your card to keep your founder rate locked in",
            linkUrl: "/notes/account",
          }).catch((err) => {
            console.error(
              `[notifications] payment_failed write failed for ${member.email}:`,
              err
            );
          });
          await sendPaymentFailedEmail({
            to: member.email,
            memberDisplayName: displayName,
            billingUrl,
          }).catch((err) => {
            console.error(
              `[email] payment-failed send threw for ${member.email}:`,
              err
            );
          });
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
  if (
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
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
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
    createdAt: now,
    updatedAt: now,
    customAvatarUrl: null,
  };

  await saveMember(record);
  await writeSessionIndex(session.id, email);

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

  // Kit "Members" tag. Failure here is logged but never fatal — a paid
  // member with a missing list tag is a recoverable problem, a paid
  // member with no Stripe record on file is not.
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
