import type { NextRequest } from "next/server";
import {
  claimSeatOrWaitlist,
  confirmExpiresAt,
  getPoolFund,
  getPoolRequestByToken,
  markRequestExpired,
  markRequestWaiting,
} from "@/lib/pool";
import { getMember, hasActiveGiftSeat } from "@/lib/members";
import { emailHasActiveMembership } from "@/lib/membership";
import { isAdmin } from "@/lib/comments";
import { finalizePoolGrant } from "@/lib/seat-grants";
import { sendPoolWaitlistEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordEvent } from "@/lib/analytics";

// POST /api/pool/confirm
// Body: { token: string }
// Returns: { state, termLabel?, expiresAt? } where state is one of:
//   "granted"         -> a seat was free; membership granted, sign-in sent
//   "waitlisted"      -> no seat free; held a place in line (FIFO)
//   "already_granted" -> this link was already used to grant a seat
//   "already_waiting" -> already in line from an earlier confirm
//   "already_member"  -> became a member since requesting; nothing to do
//   "expired"         -> link is older than the confirm window
// or { error } (404 invalid_token).
//
// This is where confirm-email-first pays off: only a click on the link
// sent to the address actually takes a seat or joins the line, so the
// shared pool can't be drained to addresses someone doesn't control.

const IP_LIMIT = 20; // attempts per hour per IP
const WINDOW_SECONDS = 60 * 60;

function termLabelOf(months: 3 | 12): string {
  return months === 3 ? "3 months" : "1 year";
}

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
    `rl:pool-confirm:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  const request = await getPoolRequestByToken(token);
  if (!request) {
    return Response.json({ error: "invalid_token" }, { status: 404 });
  }

  // Re-entrant clicks land on a settled request.
  if (request.status === "granted") {
    return Response.json({
      state: "already_granted",
      termLabel: request.termMonths ? termLabelOf(request.termMonths) : null,
      expiresAt: request.membershipExpiresAt,
    });
  }
  if (request.status === "waiting") {
    return Response.json({ state: "already_waiting" });
  }
  if (request.status === "expired") {
    return Response.json({ state: "expired" });
  }

  // pending_confirm. Honor the link window, measured from whenever the
  // window last started: the original ask, or the nudge that reopened it.
  if (Date.now() > confirmExpiresAt(request)) {
    await markRequestExpired(request.id);
    return Response.json({ state: "expired" });
  }

  await recordEvent("pool_confirmed", { source: "pool" });

  // Eligibility BEFORE taking a seat, so we never consume one for
  // someone who already has a way in (admin, or member since requesting).
  const existing = await getMember(request.email).catch(() => null);
  const membership = await emailHasActiveMembership(request.email).catch(
    () => ({ active: false, customerId: null })
  );
  if (
    isAdmin(request.email) ||
    membership.active ||
    hasActiveGiftSeat(existing)
  ) {
    await markRequestExpired(request.id);
    return Response.json({ state: "already_member" });
  }

  const outcome = await claimSeatOrWaitlist(request.id);

  if (outcome.kind === "granted") {
    const fund = await getPoolFund(outcome.fundId);
    if (!fund) {
      // Seat id came off the available queue but its record is gone. The
      // counter already moved; log loudly for admin reconciliation rather
      // than hand out a seat with no term.
      console.error(
        `[pool] granted seat ${outcome.fundId} has no fund record (request ${request.id})`
      );
      return Response.json({ error: "seat_unavailable" }, { status: 500 });
    }
    const expiresAt = await finalizePoolGrant({
      request,
      fundId: fund.id,
      termMonths: fund.termMonths,
      existing,
    });
    return Response.json({
      state: "granted",
      termLabel: termLabelOf(fund.termMonths),
      expiresAt,
    });
  }

  // No seat free: held a place in line. Auto-granted when one funds.
  await markRequestWaiting(request.id);
  await recordEvent("pool_waitlisted", { source: "pool" });
  await sendPoolWaitlistEmail({ to: request.email }).catch((err) => {
    console.error(`[pool] waitlist email failed for ${request.email}:`, err);
  });
  return Response.json({ state: "waitlisted" });
}
