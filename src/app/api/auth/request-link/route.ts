import type { NextRequest } from "next/server";
import { createMagicLink, safeNextPath } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";
import { emailHasActiveMembership, baseUrl } from "@/lib/membership";

// POST /api/auth/request-link
// Body: { email: string, next?: string }
//
// Always responds 200 to avoid leaking which emails are members. If
// the email belongs to an active member, mints a magic link and emails
// it. Otherwise quietly does nothing.

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

  const next = safeNextPath(typeof rawNext === "string" ? rawNext : undefined);

  // Look up the active membership status. Soft-fails to false when
  // Stripe isn't configured, so dev environments don't pretend everyone
  // is a member.
  const status = await emailHasActiveMembership(email).catch((err) => {
    console.error("[auth/request-link] membership lookup threw:", err);
    return { active: false, customerId: null };
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
