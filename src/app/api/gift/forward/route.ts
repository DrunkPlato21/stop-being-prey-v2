import type { NextRequest } from "next/server";
import { forwardGift, getGiftByToken } from "@/lib/gifts";
import { baseUrl } from "@/lib/membership";
import { sendGiftEmail } from "@/lib/email";
import { isAdmin } from "@/lib/comments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/gift/forward
// Body: { token: string, newRecipientEmail: string }
//
// "Pass it on": re-points an unredeemed paid gift at a new recipient
// and re-sends the gift email. Available from the redemption page when
// the original recipient already holds a seat, so the gift is never
// silently wasted. The redemption token doubles as authorization; only
// someone holding the link (buyer or original recipient) can forward.

const IP_LIMIT = 10; // forwards per hour per IP
const WINDOW_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawToken = (body as { token?: unknown })?.token;
  const rawEmail = (body as { newRecipientEmail?: unknown })
    ?.newRecipientEmail;
  if (typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return Response.json({ error: "missing_token" }, { status: 400 });
  }
  if (typeof rawEmail !== "string") {
    return Response.json({ error: "missing_email" }, { status: 400 });
  }
  const token = rawToken.trim();
  const newEmail = rawEmail.trim().toLowerCase();
  if (
    newEmail.length === 0 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
  ) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }
  if (isAdmin(newEmail)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:gift-forward:ip:${ip}`,
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
  if (!gift || gift.status !== "paid") {
    return Response.json({ error: "invalid_token" }, { status: 404 });
  }
  if (gift.recipientEmail === newEmail) {
    return Response.json({ error: "same_recipient" }, { status: 400 });
  }
  // A buyer can't route the seat back to themselves; that's the
  // self-gift guard wearing a different hat.
  if (gift.buyerEmail && gift.buyerEmail === newEmail) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  const updated = await forwardGift(gift.id, newEmail);
  if (!updated) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const redeemUrl = `${baseUrl()}/gift/${encodeURIComponent(token)}`;
  const termLabel = gift.termMonths === 3 ? "3 months" : "1 year";
  const sent = await sendGiftEmail({
    to: newEmail,
    buyerName: gift.buyerName || "A reader",
    message: gift.message,
    termLabel,
    redeemUrl,
  });
  if (!sent.ok) {
    console.error(
      `[gift] forward gift email failed for ${newEmail}: ${sent.error}`
    );
  }

  return Response.json({ ok: true, email: newEmail });
}
