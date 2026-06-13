import type { NextRequest } from "next/server";
import {
  getGift,
  listAllGiftIds,
  reminderWindowDays,
  updateGift,
} from "@/lib/gifts";
import { getMember, saveMember } from "@/lib/members";
import { baseUrl } from "@/lib/membership";
import { sendGiftExpiryReminderEmail } from "@/lib/email";
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

  return Response.json({ ok: true, scanned: ids.length, remindersSent, lapsed });
}
