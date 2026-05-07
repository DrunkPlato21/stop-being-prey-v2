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
  const status = await emailHasActiveMembership(email).catch(() => ({
    active: false,
    customerId: null,
  }));

  if (!status.active || !status.customerId) {
    // Silent success. Don't leak whether the email exists or has a sub.
    return Response.json({ ok: true });
  }

  const id = await createMagicLink({
    email,
    customerId: status.customerId,
    next,
  });
  if (!id) {
    return Response.json(
      { ok: false, error: "storage_unavailable" },
      { status: 503 }
    );
  }

  const url = `${baseUrl()}/api/auth/callback?token=${encodeURIComponent(id)}`;
  const send = await sendMagicLink({ to: email, url });
  if (!send.ok && process.env.NODE_ENV === "production") {
    return Response.json(
      { ok: false, error: send.error },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
