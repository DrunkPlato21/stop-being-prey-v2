import type { NextRequest } from "next/server";
import {
  attachPoolCheckout,
  createPoolFund,
  isPoolStorageConfigured,
} from "@/lib/pool";
import { giftTermByMonths } from "@/lib/gifts";
import { createPoolCheckoutSession } from "@/lib/membership";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordEvent } from "@/lib/analytics";

// POST /api/pool/fund-checkout
// Body: { termMonths: 3 | 12, buyerName?: string, message?: string }
// Returns: { url } on success, { error } on validation failure.
//
// Funds one ANONYMOUS seat into the community pool. No recipient: the
// seat enters the pool on the paid flip (webhook lane "pool") and is
// matched to a waiting claimer or parked as available. Same prices as a
// named gift. Buyer email is collected by Stripe Checkout.

const IP_LIMIT = 10; // checkout creates per hour per IP
const WINDOW_SECONDS = 60 * 60;
const MAX_MESSAGE_LENGTH = 280;
const MAX_NAME_LENGTH = 80;
const MAX_SEATS = 25;

export async function POST(req: NextRequest) {
  if (!isPoolStorageConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawTerm = (body as { termMonths?: unknown })?.termMonths;
  const rawName = (body as { buyerName?: unknown })?.buyerName;
  const rawMessage = (body as { message?: unknown })?.message;
  const rawSeats = (body as { seats?: unknown })?.seats;

  const term = giftTermByMonths(typeof rawTerm === "number" ? rawTerm : NaN);
  if (!term) {
    return Response.json({ error: "invalid_term" }, { status: 400 });
  }

  // Seats per checkout, clamped 1..MAX_SEATS so a multi-seat order can't
  // mint an unbounded fan-out of child seats on the webhook.
  const seats =
    typeof rawSeats === "number" && Number.isFinite(rawSeats)
      ? Math.min(Math.max(Math.floor(rawSeats), 1), MAX_SEATS)
      : 1;

  const buyerName =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim().slice(0, MAX_NAME_LENGTH)
      : null;
  const message =
    typeof rawMessage === "string" && rawMessage.trim().length > 0
      ? rawMessage.trim().slice(0, MAX_MESSAGE_LENGTH)
      : null;

  // Rate limit so a bot can't mint unbounded pending fund records.
  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:pool-fund:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  const fund = await createPoolFund({
    buyerName,
    message,
    termMonths: term.months,
    amountCents: term.amountCents,
    seats,
  });
  if (!fund) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const result = await createPoolCheckoutSession({
    fundId: fund.id,
    termMonths: term.months,
    termLabel: term.label,
    amountCents: term.amountCents,
    seats,
  });
  if ("error" in result) {
    const status =
      result.error === "stripe_not_configured" ||
      result.error === "no_url_returned"
        ? 500
        : 400;
    return Response.json({ error: result.error }, { status });
  }

  // Bind session -> fund so the webhook resolves the record even if the
  // metadata roundtrip goes stale (same pattern as gifts).
  await attachPoolCheckout(fund.id, result.sessionId);
  await recordEvent("pool_fund_started", { source: "pool" });

  return Response.json({ url: result.url });
}
