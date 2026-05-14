import type { NextRequest } from "next/server";
import { createMagicLink, safeNextPath } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import {
  baseUrl,
  emailHasActiveMembership,
  ensureDevMemberRecord,
} from "@/lib/membership";
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

  // Look up the active membership status. Soft-fails to false when
  // Stripe isn't configured, so dev environments don't pretend everyone
  // is a member.
  const status = await emailHasActiveMembership(email).catch((err) => {
    console.error("[auth/request-link] membership lookup threw:", err);
    return { active: false, customerId: null };
  });

  // Dev grant path: emailHasActiveMembership returns active:true for
  // every email when DEV_AUTO_GRANT=1, but it doesn't write a member
  // record. Bridge the gap here so the chrome, comments, and badge
  // system all see this email as a real (test-mode) member.
  await ensureDevMemberRecord(email).catch((err) => {
    console.warn("[auth/request-link] ensureDevMemberRecord failed:", err);
  });

  if (!status.active || !status.customerId) {
    // Silent success to the caller — don't leak whether the email is a
    // member. But in dev, log loudly so a developer can tell why no
    // email arrived. (DEV_AUTO_GRANT=1 short-circuits this whole path.)
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[auth/request-link] no active membership for ${email}; ` +
          `skipping magic link send. Set DEV_AUTO_GRANT=1 in .env.local ` +
          `to bypass the Stripe check while testing.`
      );
    }
    return Response.json({ ok: true });
  }

  const id = await createMagicLink({
    email,
    customerId: status.customerId,
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
