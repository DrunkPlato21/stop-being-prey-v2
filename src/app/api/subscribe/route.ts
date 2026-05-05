import type { NextRequest } from "next/server";

// Server-side proxy to Kit's authenticated v4 API. The browser hits this
// same-origin route to avoid CORS; we forward server-to-server.
//
// Kit's v4 form-subscribe endpoint REQUIRES the subscriber to exist in the
// account already — otherwise it 404s. So this route does it in two steps:
//   1. POST /v4/subscribers          (create or upsert by email)
//   2. POST /v4/forms/{id}/subscribers  (attach to the SBP form)
//
// Form 9402960 = "stopbeingprey.com" (verified via /v4/forms listing).
const KIT_API_BASE = "https://api.kit.com/v4";
const SBP_FORM_ID = 9402960;

async function callKit(
  apiKey: string,
  path: string,
  email: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await fetch(`${KIT_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Kit-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email_address: email }),
  });
  const body = await response.text();
  console.log(
    `[subscribe] ${path} -> ${response.status} ${response.statusText} :: ${body}`,
  );
  return { ok: response.ok, status: response.status, body };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    console.error("[subscribe] KIT_API_KEY is not set");
    return Response.json(
      { error: "Subscription service is not configured." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const rawEmail = (body as { email_address?: unknown })?.email_address;
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  if (!email || !email.includes("@")) {
    return Response.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }

  try {
    // Step 1: create the subscriber globally. Kit treats this as an upsert
    // for existing emails, so re-submitting is safe.
    const created = await callKit(apiKey, "/subscribers", email);
    if (!created.ok) {
      return Response.json(
        { error: "Subscription failed. Please try again." },
        { status: created.status },
      );
    }

    // Step 2: attach to the SBP form. Now that the subscriber exists this
    // should return 200/201.
    const attached = await callKit(
      apiKey,
      `/forms/${SBP_FORM_ID}/subscribers`,
      email,
    );
    if (!attached.ok) {
      return Response.json(
        { error: "Subscription failed. Please try again." },
        { status: attached.status },
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[subscribe] Kit request threw:", err);
    return Response.json(
      { error: "Could not reach the subscription service." },
      { status: 502 },
    );
  }
}
