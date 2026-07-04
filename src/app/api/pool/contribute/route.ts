import type { NextRequest } from "next/server";
import {
  attachContributionCheckout,
  createPoolContribution,
  isPoolStorageConfigured,
  POOL_CONTRIBUTION_CEIL_CENTS,
  POOL_CONTRIBUTION_FLOOR_CENTS,
} from "@/lib/pool";
import { createPoolContributionCheckoutSession } from "@/lib/membership";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordEvent } from "@/lib/analytics";

// POST /api/pool/contribute
// Body: { amountCents: number }
// Returns: { url } on success, { error } on validation failure.
//
// Chips an OPEN amount into the community pot. No recipient, no whole
// seat: the amount accumulates (webhook lane "pool_contribution") and
// mints an anonymous seat each time the pot crosses a seat's price. The
// lower-friction sibling of fund-checkout ($5 vs a full $39/$130 seat).

const IP_LIMIT = 12; // checkout creates per hour per IP
const WINDOW_SECONDS = 60 * 60;

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

  const raw = (body as { amountCents?: unknown })?.amountCents;
  const amountCents =
    typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  if (!Number.isFinite(amountCents)) {
    return Response.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (amountCents < POOL_CONTRIBUTION_FLOOR_CENTS) {
    return Response.json({ error: "below_floor" }, { status: 400 });
  }
  if (amountCents > POOL_CONTRIBUTION_CEIL_CENTS) {
    return Response.json({ error: "above_ceiling" }, { status: 400 });
  }

  // Rate limit so a bot can't mint unbounded pending contribution records.
  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:pool-contribute:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  const contribution = await createPoolContribution({ amountCents });
  if (!contribution) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const result = await createPoolContributionCheckoutSession({
    contributionId: contribution.id,
    amountCents,
  });
  if ("error" in result) {
    const status =
      result.error === "stripe_not_configured" ||
      result.error === "no_url_returned"
        ? 500
        : 400;
    return Response.json({ error: result.error }, { status });
  }

  // Bind session -> contribution so the webhook resolves the record even
  // if the metadata roundtrip goes stale (same pattern as funds/gifts).
  await attachContributionCheckout(contribution.id, result.sessionId);
  await recordEvent("pool_contribution_started", { source: "pool" });

  return Response.json({ url: result.url });
}
