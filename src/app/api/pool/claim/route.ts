import type { NextRequest } from "next/server";
import {
  createPoolRequest,
  getActivePoolRequestByEmail,
  isPoolStorageConfigured,
} from "@/lib/pool";
import { getMember, hasActiveGiftSeat } from "@/lib/members";
import { baseUrl, emailHasActiveMembership } from "@/lib/membership";
import { isAdmin } from "@/lib/comments";
import { sendPoolClaimConfirmEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordEvent } from "@/lib/analytics";

// POST /api/pool/claim
// Body: { email: string, note?: string }
// Returns: { state } where state is one of:
//   "sent"            -> confirm link emailed, click to finish
//   "confirm_pending" -> we already sent a confirm link, check inbox
//   "waiting"         -> already confirmed + in line for a seat
//   "already_member"  -> this address already has a way in; just sign in
//
// Confirm-email-first: this NEVER touches the pool counters or queues.
// It only records the request and emails a one-click link. The seat is
// taken (or the waitlist joined) at /api/pool/confirm. No proof, no
// justification required — the trust is the point.

const IP_LIMIT = 8; // requests per hour per IP
const WINDOW_SECONDS = 60 * 60;
const MAX_NOTE_LENGTH = 280;

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

  const rawEmail = (body as { email?: unknown })?.email;
  const rawNote = (body as { note?: unknown })?.note;

  if (typeof rawEmail !== "string") {
    return Response.json({ error: "missing_email" }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();
  if (email.length === 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  // The author never claims a seat. Treat as already-in so the response
  // gives nothing away.
  if (isAdmin(email)) {
    return Response.json({ state: "already_member" });
  }

  // Already inside (paid or on a live gift/pool seat): don't consume a
  // pool seat. Point them at signing in instead.
  const existing = await getMember(email).catch(() => null);
  const membership = await emailHasActiveMembership(email).catch(() => ({
    active: false,
    customerId: null,
  }));
  if (membership.active || hasActiveGiftSeat(existing)) {
    return Response.json({ state: "already_member" });
  }

  // One active request per email. Don't let a re-submit pile up a second
  // confirm link or a second slot in line.
  const active = await getActivePoolRequestByEmail(email).catch(() => null);
  if (active) {
    return Response.json({
      state: active.status === "waiting" ? "waiting" : "confirm_pending",
    });
  }

  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:pool-claim:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }

  const note =
    typeof rawNote === "string" && rawNote.trim().length > 0
      ? rawNote.trim().slice(0, MAX_NOTE_LENGTH)
      : null;

  const request = await createPoolRequest({ email, note });
  if (!request) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const confirmUrl = `${baseUrl()}/pool/confirm/${encodeURIComponent(
    request.confirmToken
  )}`;
  const sent = await sendPoolClaimConfirmEmail({ to: email, confirmUrl });
  if (!sent.ok) {
    console.error(
      `[pool] claim confirm email FAILED for ${email}: ${sent.error}. Confirm link: ${confirmUrl}`
    );
  }
  await recordEvent("pool_requested", { source: "pool" });

  return Response.json({ state: "sent" });
}
