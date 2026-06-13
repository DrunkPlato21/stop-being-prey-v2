import type { NextRequest } from "next/server";
import {
  attachGiftCheckout,
  createGift,
  giftTermByMonths,
  isGiftStorageConfigured,
} from "@/lib/gifts";
import { createGiftCheckoutSession } from "@/lib/membership";
import { isAdmin } from "@/lib/comments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/gift/checkout
// Body: { recipientEmail: string, termMonths: 3 | 12,
//         buyerName?: string, message?: string }
// Returns: { url } on success, { error } on validation failure.
//
// Anyone can buy (member or not); the buyer's own email is collected
// by Stripe Checkout. The gift record is pre-written here and the
// webhook (lane "gift") is authoritative on the paid flip, including
// the self-gift guard (buyer email isn't known until then).

const IP_LIMIT = 10; // checkout creates per hour per IP
const WINDOW_SECONDS = 60 * 60;

const MAX_MESSAGE_LENGTH = 280;
const MAX_NAME_LENGTH = 80;

export async function POST(req: NextRequest) {
  if (!isGiftStorageConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawRecipient = (body as { recipientEmail?: unknown })?.recipientEmail;
  const rawTerm = (body as { termMonths?: unknown })?.termMonths;
  const rawName = (body as { buyerName?: unknown })?.buyerName;
  const rawMessage = (body as { message?: unknown })?.message;

  if (typeof rawRecipient !== "string") {
    return Response.json({ error: "missing_recipient" }, { status: 400 });
  }
  const recipientEmail = rawRecipient.trim().toLowerCase();
  if (
    recipientEmail.length === 0 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)
  ) {
    return Response.json({ error: "invalid_recipient" }, { status: 400 });
  }

  // Hard guard: the editor is a separate level and never holds a paid
  // slot, gifted or otherwise.
  if (isAdmin(recipientEmail)) {
    return Response.json({ error: "invalid_recipient" }, { status: 400 });
  }

  const term = giftTermByMonths(
    typeof rawTerm === "number" ? rawTerm : NaN
  );
  if (!term) {
    return Response.json({ error: "invalid_term" }, { status: 400 });
  }

  const buyerName =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim().slice(0, MAX_NAME_LENGTH)
      : null;
  const message =
    typeof rawMessage === "string" && rawMessage.trim().length > 0
      ? rawMessage.trim().slice(0, MAX_MESSAGE_LENGTH)
      : null;

  // Rate limit checkout creation so a bot can't mint unbounded pending
  // gift records. Fail-open if Redis is unconfigured (createGift would
  // have failed anyway).
  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:gift-checkout:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  const gift = await createGift({
    recipientEmail,
    buyerName,
    message,
    termMonths: term.months,
    amountCents: term.amountCents,
  });
  if (!gift) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const result = await createGiftCheckoutSession({
    giftId: gift.id,
    termMonths: term.months,
    termLabel: term.label,
    amountCents: term.amountCents,
    recipientEmail,
  });
  if ("error" in result) {
    const status =
      result.error === "stripe_not_configured" ||
      result.error === "no_url_returned"
        ? 500
        : 400;
    return Response.json({ error: result.error }, { status });
  }

  // Bind session -> gift so the webhook can resolve the record even if
  // the metadata roundtrip goes stale (same pattern as case reviews).
  await attachGiftCheckout(gift.id, result.sessionId);

  return Response.json({ url: result.url });
}
