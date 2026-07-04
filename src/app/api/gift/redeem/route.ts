import type { NextRequest } from "next/server";
import {
  addMonths,
  getGiftByToken,
  giftTermByMonths,
  markGiftRedeemed,
  updateGift,
} from "@/lib/gifts";
import {
  getMember,
  hasActiveGiftSeat,
  saveMember,
} from "@/lib/members";
import { baseUrl, emailHasActiveMembership } from "@/lib/membership";
import { grantPrepaidSeat } from "@/lib/seat-grants";
import { createMagicLink } from "@/lib/auth";
import {
  sendGiftAlreadyMemberEmail,
  sendGiftClaimedEmail,
  sendMagicLink,
} from "@/lib/email";
import { isAdmin } from "@/lib/comments";
import { createNotification } from "@/lib/notifications";
import { recordEvent } from "@/lib/analytics";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/gift/redeem
// Body: { token: string }
// Returns: { state: "granted" | "extended" | "already_member" |
//            "already_redeemed", email?, expiresAt? } or { error }.
//
// The grant is keyed to the gift's recipient email, never to whoever
// holds the link. Three outcomes for a valid paid gift:
//   - recipient has no membership (or a lapsed one): grant a regular
//     prepaid seat and auto-send the first sign-in link.
//   - recipient already holds a gifted seat: extend the term.
//   - recipient pays for their own subscription: don't double-grant;
//     surface the pass-it-on path and tell the buyer once.

const IP_LIMIT = 20; // attempts per hour per IP
const WINDOW_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawToken = (body as { token?: unknown })?.token;
  if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return Response.json({ error: "missing_token" }, { status: 400 });
  }
  const token = rawToken.trim();

  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:gift-redeem:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  const gift = await getGiftByToken(token);
  if (!gift) {
    return Response.json({ error: "invalid_token" }, { status: 404 });
  }
  if (gift.status === "redeemed") {
    return Response.json({
      state: "already_redeemed",
      email: gift.recipientEmail,
    });
  }
  if (gift.status !== "paid") {
    return Response.json({ error: "invalid_token" }, { status: 404 });
  }

  const email = gift.recipientEmail;
  // Belt and braces: the checkout route already rejects the admin
  // email, but a forwarded gift re-points the recipient, so re-check.
  if (isAdmin(email)) {
    return Response.json({ error: "invalid_recipient" }, { status: 400 });
  }

  const term = giftTermByMonths(gift.termMonths);
  if (!term) {
    console.error(`[gift] gift ${gift.id} has unknown term ${gift.termMonths}`);
    return Response.json({ error: "invalid_token" }, { status: 404 });
  }

  const existing = await getMember(email).catch(() => null);

  // Recipient already inside on a gifted seat: stack the new term on
  // top of the current one instead of wasting the gift.
  if (existing && hasActiveGiftSeat(existing)) {
    const base = Math.max(Date.now(), existing.giftExpiresAt ?? 0);
    const newExpiresAt = addMonths(base, term.months);
    await saveMember({
      ...existing,
      status: "active",
      giftExpiresAt: newExpiresAt,
      updatedAt: Date.now(),
    });
    await markGiftRedeemed(gift.id, newExpiresAt);
    await recordEvent("gift_redeemed", { source: "gift" });
    await notifyBuyerClaimed(gift.buyerEmail, email, term.label);
    await createNotification({
      memberEmail: email,
      type: "founder_confirmed",
      title: "Your seat just got longer.",
      body: "Someone added time to your gifted membership.",
      linkUrl: "/desk",
    }).catch((err) => {
      console.error(`[gift] extend notification failed for ${email}:`, err);
    });
    return Response.json({
      state: "extended",
      email,
      expiresAt: newExpiresAt,
    });
  }

  // Recipient pays their own way already (active Stripe subscription).
  // Don't double-grant; tell the buyer once and surface pass-it-on.
  const membership = await emailHasActiveMembership(email).catch((err) => {
    console.error("[gift] membership lookup threw:", err);
    return { active: false, customerId: null };
  });
  if (membership.active) {
    if (gift.buyerEmail && !gift.buyerNotifiedAlreadyMemberAt) {
      const redeemUrl = `${baseUrl()}/gift/${encodeURIComponent(token)}`;
      const sent = await sendGiftAlreadyMemberEmail({
        to: gift.buyerEmail,
        recipientEmail: email,
        redeemUrl,
      });
      if (sent.ok) {
        await updateGift(gift.id, {
          buyerNotifiedAlreadyMemberAt: Date.now(),
        });
      }
    }
    return Response.json({ state: "already_member", email });
  }

  // Grant a regular prepaid seat via the shared lane helper (same path
  // the community pool uses). A returning lapsed member keeps their
  // createdAt + avatar.
  const { record, expiresAt } = await grantPrepaidSeat({
    email,
    termMonths: term.months,
    source: { kind: "gift", giftId: gift.id },
    existing,
    notification: {
      title: "Welcome to Stop Being Prey.",
      body: "Someone put you in the room. Click for your member home.",
      linkUrl: "/desk",
    },
  });
  await markGiftRedeemed(gift.id, expiresAt);
  await recordEvent("gift_redeemed", { source: "gift" });

  // First sign-in link, dispatched automatically so the recipient
  // lands inside without a second form (mirrors /membership/success).
  const linkId = await createMagicLink({
    email,
    customerId: record.stripeCustomerId,
    next: "/desk",
  });
  if (linkId) {
    const url = `${baseUrl()}/api/auth/callback?token=${encodeURIComponent(linkId)}`;
    const sent = await sendMagicLink({ to: email, url });
    if (!sent.ok) {
      console.error(
        `[gift] welcome magic link send failed for ${email}: ${sent.error}`
      );
    }
  } else {
    console.error(`[gift] createMagicLink returned null for ${email}`);
  }

  await notifyBuyerClaimed(gift.buyerEmail, email, term.label);

  return Response.json({ state: "granted", email, expiresAt });
}

async function notifyBuyerClaimed(
  buyerEmail: string | null,
  recipientEmail: string,
  termLabel: string
): Promise<void> {
  if (!buyerEmail) return;
  const sent = await sendGiftClaimedEmail({
    to: buyerEmail,
    recipientEmail,
    termLabel,
  });
  if (!sent.ok) {
    console.warn(
      `[gift] buyer claimed email failed for ${buyerEmail}: ${sent.error}`
    );
  }
}
