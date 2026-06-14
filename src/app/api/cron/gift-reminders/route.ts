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
  markRequestReminded,
} from "@/lib/pool";
import { getMember, saveMember } from "@/lib/members";
import { baseUrl } from "@/lib/membership";
import {
  sendGiftExpiryReminderEmail,
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

  return Response.json({
    ok: true,
    scanned: ids.length,
    remindersSent,
    lapsed,
    poolScanned: poolIds.length,
    poolRemindersSent,
    poolLapsed,
  });
}
