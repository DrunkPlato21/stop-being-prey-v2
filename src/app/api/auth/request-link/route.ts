import type { NextRequest } from "next/server";
import { createMagicLink, safeNextPath } from "@/lib/auth";
import { sendMagicLink, sendNoMembershipNote } from "@/lib/email";
import { recordEvent } from "@/lib/analytics";
import {
  baseUrl,
  emailHasActiveMembership,
  ensureDevMemberRecord,
} from "@/lib/membership";
import { getMember, type MemberSubscriptionStatus } from "@/lib/members";
import { isAdmin } from "@/lib/comments";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// POST /api/auth/request-link
// Body: { email: string, next?: string }
//
// Always responds 200 to avoid leaking which emails are members. If
// the email belongs to an active member, mints a magic link and emails
// it. Otherwise quietly does nothing.
//
// Rate limited to defend against email-bombing: per-IP and per-email
// caps. On limit hit returns 429 with no body details (no leak of
// whether the email is a member).

const IP_LIMIT = 10; // requests per hour per IP
const EMAIL_LIMIT = 5; // requests per hour per email
const WINDOW_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const rawEmail = (body as { email?: unknown })?.email;
  const rawNext = (body as { next?: unknown })?.next;
  if (typeof rawEmail !== "string") {
    return Response.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();
  if (email.length === 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  // Rate limit: cap how often a single IP can hit this endpoint AND how
  // many magic links a single email can be the target of. Both windows
  // are 1 hour. Fail-open if Redis is unconfigured (the route's other
  // calls would have failed anyway).
  const ip = clientIp(req.headers);
  const ipResult = await rateLimit(
    `rl:request-link:ip:${ip}`,
    IP_LIMIT,
    WINDOW_SECONDS
  );
  if (!ipResult.ok) {
    return new Response("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(ipResult.retryAfterSeconds) },
    });
  }
  const emailResult = await rateLimit(
    `rl:request-link:email:${email}`,
    EMAIL_LIMIT,
    WINDOW_SECONDS
  );
  if (!emailResult.ok) {
    // Silent 200 — don't tell a flooder whether the email exists.
    // The legitimate owner of the email is unaffected (they already
    // have a recent link in their inbox).
    return Response.json({ ok: true });
  }

  const next = safeNextPath(typeof rawNext === "string" ? rawNext : undefined);

  // Admin bypass: the editor account doesn't hold a paid subscription
  // (admin is its own level, distinct from founder/regular). We mint
  // a session with a synthetic customer id keyed on the email — the
  // session JWT just needs *some* customerId to satisfy the type, and
  // routes that hit Stripe (e.g. the customer portal) gate on the
  // `cus_` prefix already.
  const admin = isAdmin(email);
  if (admin) {
    const id = await createMagicLink({
      email,
      customerId: `admin_${email}`,
      next,
    });
    if (!id) {
      console.error("[auth/request-link] createMagicLink returned null (admin)");
      return Response.json(
        { ok: false, error: "storage_unavailable" },
        { status: 503 }
      );
    }
    const url = `${baseUrl()}/api/auth/callback?token=${encodeURIComponent(id)}`;
    const send = await sendMagicLink({ to: email, url });
    if (!send.ok && process.env.NODE_ENV === "production") {
      console.error(
        `[auth/request-link] sendMagicLink failed for admin ${email}: ${send.error}`
      );
      return Response.json(
        { ok: false, error: send.error },
        { status: 502 }
      );
    }
    return Response.json({ ok: true });
  }

  // Counted here rather than at the top of the route so it measures real
  // reader intent: past the rate limiter (a flooder's 6th attempt is not a
  // 6th person trying to get in) and past the admin branch (Clay signing
  // in is not a data point). Pairs with signin_no_match below — the gap
  // between the two is how many people tried to get in and couldn't.
  void recordEvent("signin_requested", { source: "signin" });

  // Decide whether to send a login link. The webhook-maintained member
  // record is the source of truth: if it says active/trialing, send.
  //
  // Resolving the member via a LIVE Stripe email-search
  // (emailHasActiveMembership -> findCustomerByEmail) made login brittle:
  // a case / secondary-email mismatch on the Stripe customer, or a
  // transient Stripe error, silently locked real paying members out of
  // their own account with no email and nothing in Resend (incident
  // 2026-06-14: founder #12, active record + valid customer id, but the
  // by-email search missed). Trust the record; fall back to the Stripe
  // lookup only when there's no record yet — a just-completed checkout
  // race, or the DEV_AUTO_GRANT path.
  //
  // Statuses that still entitle a member to sign in. active/trialing are
  // the obvious case. past_due / unpaid / incomplete are members whose
  // CARD JUST FAILED — the exact people who most need to get in (to fix
  // the card), yet the old gate silently refused them: it fell through to
  // the active-only Stripe check below, hit the silent 200, and NOTHING
  // was sent (nothing in Resend, because sendMagicLink was never called).
  // Two real members were trapped this way. A failed payment must never
  // lock a member out of their own account. Fully-dead states (canceled /
  // incomplete_expired / paused) still fall through to /reactivate.
  const SIGN_IN_STATUSES: MemberSubscriptionStatus[] = [
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "incomplete",
  ];
  let customerId: string | null = null;
  const member = await getMember(email).catch(() => null);
  if (
    member &&
    SIGN_IN_STATUSES.includes(member.status) &&
    member.stripeCustomerId
  ) {
    customerId = member.stripeCustomerId;
  } else {
    const status = await emailHasActiveMembership(email).catch((err) => {
      console.error("[auth/request-link] membership lookup threw:", err);
      return { active: false, customerId: null };
    });
    // Dev grant path: DEV_AUTO_GRANT=1 makes the lookup active without a
    // member record; bridge it so the chrome, comments, and badges see a
    // real (test-mode) member.
    await ensureDevMemberRecord(email).catch((err) => {
      console.warn("[auth/request-link] ensureDevMemberRecord failed:", err);
    });
    if (status.active && status.customerId) customerId = status.customerId;
  }

  if (!customerId) {
    // Silent success to the CALLER — the response must stay identical
    // either way so this endpoint can't be used to probe who is a member.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[auth/request-link] no active membership for ${email}; sending the ` +
          `no-membership note instead. Set DEV_AUTO_GRANT=1 to bypass while testing.`
      );
    }
    // But the person still gets an email. Silence was the actual failure
    // here: they sat waiting on a link that was never coming, and the only
    // way it ever surfaced was one of them tracking down Clay's address to
    // ask. This leaks nothing — the note goes only to the address that was
    // typed, so its reader already knows what they typed, and from the
    // outside every request still produces exactly one email.
    void recordEvent("signin_no_match", { source: "signin" });
    const note = await sendNoMembershipNote({ to: email }).catch(
      (err): { ok: false; error: string } => ({
        ok: false,
        error: err instanceof Error ? err.message : "send_failed",
      })
    );
    if (!note.ok && process.env.NODE_ENV === "production") {
      // Log and swallow. A failed courtesy note must never change the
      // response, which has to stay a silent 200.
      console.error(
        `[auth/request-link] no-membership note failed for ${email}: ${note.error}`
      );
    }
    return Response.json({ ok: true });
  }

  const id = await createMagicLink({
    email,
    customerId,
    next,
  });
  if (!id) {
    console.error("[auth/request-link] createMagicLink returned null");
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 }
    );
  }

  const url = `${baseUrl()}/api/auth/callback?token=${encodeURIComponent(id)}`;
  const send = await sendMagicLink({ to: email, url });
  if (!send.ok) {
    console.error(
      `[auth/request-link] sendMagicLink failed for ${email}: ${send.error}`
    );
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { ok: false, error: send.error },
        { status: 502 }
      );
    }
  }

  return Response.json({ ok: true });
}
