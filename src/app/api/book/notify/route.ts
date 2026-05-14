import type { NextRequest } from "next/server";
import { applyBookNotifyTag } from "@/lib/kit";

// POST /api/book/notify  body: { email: string }
// Public to authenticated members (the /book page is member-gated).
// Upserts the subscriber in Kit and attaches the book-notify tag.
// Idempotent — re-submission for an already-tagged email is a no-op.

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const rawEmail = (body as { email?: unknown })?.email;
  if (typeof rawEmail !== "string") {
    return Response.json({ error: "missing_email" }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }

  const result = await applyBookNotifyTag(email);
  if (!result.ok) {
    if (result.reason === "not_configured") {
      // Newsletter platform not yet wired up. Treat as a soft success
      // for the member so the form still feels live; log the gap.
      console.warn(
        "[book-notify] Kit not configured; signup acknowledged without persistence",
        { email }
      );
      return Response.json({ ok: true });
    }
    console.error("[book-notify] Kit call failed:", result);
    return Response.json(
      { error: "kit_failed", reason: result.reason },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}
