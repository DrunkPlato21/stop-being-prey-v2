import type { NextRequest } from "next/server";
import {
  getGift,
  listAllGiftIds,
  reminderWindowDays,
  updateGift,
} from "@/lib/gifts";
import {
  getPoolRequest,
  listAllPoolRequestIds,
  listUnconfirmedRequests,
  markRequestConfirmNudged,
  markRequestReminded,
} from "@/lib/pool";
import { getMember, saveMember } from "@/lib/members";
import { baseUrl } from "@/lib/membership";
import {
  sendGiftExpiryReminderEmail,
  sendPoolConfirmNudgeEmail,
  sendPoolExpiryReminderEmail,
} from "@/lib/email";
import { createNotification } from "@/lib/notifications";

// GET /api/cron/gift-reminders
// Daily sweep over redeemed gifts (vercel.json cron), two jobs:
//   1. The conversion hook: a gifted seat nearing its end gets ONE
//      "keep your seat" email + in-site notification pointing at
//      /membership?src=gift, so the recipient can continue on their
//      own card and the funnel counters attribute it to "gift".
//   2. Lapse cleanup: a gift term that has passed flips the member
//      record to canceled (unless the recipient converted, in which
//      case the webhook already replaced the record with a
//      subscription-backed one and this leaves it alone).
//
// Guarded by CRON_SECRET (Vercel sends it as a Bearer token). The
// route refuses to run without the secret so a local dev server
// pointing at the shared Redis can't mass-email real recipients.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not configured.", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const ids = await listAllGiftIds();
  const now = Date.now();
  let remindersSent = 0;
  let lapsed = 0;

  for (const id of ids) {
    const gift = await getGift(id).catch(() => null);
    if (!gift || gift.status !== "redeemed" || !gift.expiresAt) continue;

    // Lapse: term over, member record still riding this gift.
    if (gift.expiresAt <= now) {
      const member = await getMember(gift.recipientEmail).catch(() => null);
      if (
        member &&
        member.viaGiftId === gift.id &&
        (member.status === "active" || member.status === "trialing")
      ) {
        await saveMember({
          ...member,
          status: "canceled",
          updatedAt: now,
        });
        lapsed++;
      }
      continue;
    }

    // Reminder: inside the window, not yet sent, not already converted.
    if (gift.reminderSentAt || gift.convertedAt) continue;
    const windowMs =
      reminderWindowDays(gift.termMonths) * 24 * 60 * 60 * 1000;
    if (gift.expiresAt - now > windowMs) continue;

    const membershipUrl = `${baseUrl()}/membership?src=gift`;
    const expiresAtLabel = new Date(gift.expiresAt).toLocaleDateString(
      "en-US",
      { month: "long", day: "numeric", year: "numeric" }
    );
    const sent = await sendGiftExpiryReminderEmail({
      to: gift.recipientEmail,
      expiresAtLabel,
      membershipUrl,
    });
    if (sent.ok) {
      await updateGift(gift.id, { reminderSentAt: now });
      remindersSent++;
      await createNotification({
        memberEmail: gift.recipientEmail,
        type: "payment_failed",
        title: "Your seat is almost up.",
        body: `Your gifted membership ends ${expiresAtLabel}. Keep your seat.`,
        linkUrl: "/membership?src=gift",
      }).catch((err) => {
        console.error(
          `[gift] reminder notification failed for ${gift.recipientEmail}:`,
          err
        );
      });
    } else {
      console.error(
        `[gift] reminder email failed for ${gift.recipientEmail}: ${sent.error}`
      );
    }
  }

  // === Pool pass: the same arc for free (pooled) seats =============
  // Pool grants use the same prepaid-seat mechanism as gifts but are
  // tracked on the claim REQUEST (status granted, membershipExpiresAt).
  // Mirror the gift logic: nudge near expiry, lapse-cancel past it. We
  // act only while the member is still riding THIS pooled seat
  // (member.viaPoolFundId === the request's seat) — a member who
  // converted to their own card gets a fresh record without that field.
  const poolIds = await listAllPoolRequestIds();
  let poolRemindersSent = 0;
  let poolLapsed = 0;

  for (const id of poolIds) {
    const req = await getPoolRequest(id).catch(() => null);
    if (
      !req ||
      req.status !== "granted" ||
      !req.membershipExpiresAt ||
      !req.termMonths ||
      !req.seatFundId
    ) {
      continue;
    }

    const member = await getMember(req.email).catch(() => null);
    const onThisSeat = !!member && member.viaPoolFundId === req.seatFundId;

    // Lapse: term over, member still on this pooled seat.
    if (req.membershipExpiresAt <= now) {
      if (
        onThisSeat &&
        (member!.status === "active" || member!.status === "trialing")
      ) {
        await saveMember({ ...member!, status: "canceled", updatedAt: now });
        poolLapsed++;
      }
      continue;
    }

    // Reminder: inside the window, not sent, still on the pooled seat.
    if (req.reminderSentAt || !onThisSeat) continue;
    const poolWindowMs =
      reminderWindowDays(req.termMonths) * 24 * 60 * 60 * 1000;
    if (req.membershipExpiresAt - now > poolWindowMs) continue;

    const membershipUrl = `${baseUrl()}/membership?src=pool`;
    const expiresAtLabel = new Date(req.membershipExpiresAt).toLocaleDateString(
      "en-US",
      { month: "long", day: "numeric", year: "numeric" }
    );
    const sent = await sendPoolExpiryReminderEmail({
      to: req.email,
      expiresAtLabel,
      membershipUrl,
    });
    if (sent.ok) {
      await markRequestReminded(req.id);
      poolRemindersSent++;
      await createNotification({
        memberEmail: req.email,
        type: "payment_failed",
        title: "Your seat is almost up.",
        body: `The seat a reader covered for you ends ${expiresAtLabel}. Keep it going.`,
        linkUrl: "/membership?src=pool",
      }).catch((err) => {
        console.error(
          `[pool] reminder notification failed for ${req.email}:`,
          err
        );
      });
    } else {
      console.error(
        `[pool] reminder email failed for ${req.email}: ${sent.error}`
      );
    }
  }

  // === Unconfirmed pass: the people who asked and then stalled ======
  // A seat request only becomes real when the claimer clicks the
  // confirm link. Until then they are invisible to the waitlist, so a
  // funded seat routes past them to someone who asked days later. That
  // happened: a request sat at pending_confirm for four days while two
  // seats were minted and granted over the top of it, and nothing in
  // the system ever went back for him.
  //
  // One nudge, once, and only inside a sane window. Under a day is
  // pestering someone who may still be getting to it; past a fortnight
  // they have moved on and a reminder is just a stranger in the inbox.
  const NUDGE_AFTER_MS = 24 * 60 * 60 * 1000;
  const NUDGE_UNTIL_MS = 14 * 24 * 60 * 60 * 1000;
  const unconfirmed = await listUnconfirmedRequests();
  let confirmNudgesSent = 0;

  for (const req of unconfirmed) {
    if (req.confirmNudgeSentAt) continue;
    const age = now - req.createdAt;
    if (age < NUDGE_AFTER_MS || age > NUDGE_UNTIL_MS) continue;

    // Never chase someone who found their own way in between asking and
    // now (bought a seat, got gifted one, or is the author testing).
    const member = await getMember(req.email).catch(() => null);
    if (member && (member.status === "active" || member.status === "trialing")) {
      continue;
    }

    // Mark BEFORE sending. A send that throws halfway costs one person
    // one nudge; an unmarked send that succeeds costs them a duplicate
    // every day until someone notices. The quieter failure wins. This
    // also restarts the 72h confirm window, so the link below is live.
    await markRequestConfirmNudged(req.id);

    const confirmUrl = `${baseUrl()}/pool/confirm/${encodeURIComponent(
      req.confirmToken
    )}`;
    const sent = await sendPoolConfirmNudgeEmail({
      to: req.email,
      confirmUrl,
    });
    if (sent.ok) {
      confirmNudgesSent++;
    } else {
      console.error(
        `[pool] confirm nudge failed for ${req.email}: ${sent.error}. Link: ${confirmUrl}`
      );
    }
  }

  return Response.json({
    ok: true,
    scanned: ids.length,
    remindersSent,
    lapsed,
    poolScanned: poolIds.length,
    poolRemindersSent,
    poolLapsed,
    unconfirmedScanned: unconfirmed.length,
    confirmNudgesSent,
  });
}
