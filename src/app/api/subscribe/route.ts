import type { NextRequest } from "next/server";

// Server-side proxy to Kit's authenticated v4 API. The browser hits this
// same-origin route to avoid CORS; we forward server-to-server to Kit.
//
// We use the authenticated v4 endpoint (api.kit.com) rather than the public
// embed endpoint (app.kit.com/forms/<id>/subscriptions) because Kit's bot
// protection quarantines unauthenticated server-side submissions to the
// embed endpoint. Authenticated requests bypass that.
//
// 9402960 is the SBP form's numeric ID. The alphanumeric value Kit shows
// in its embed UI (e.g. 6d65bbd568) is the form's UID/embed token, not
// what the API endpoint expects.
const KIT_FORM_ENDPOINT =
  "https://api.kit.com/v4/forms/9402960/subscribers";

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
    const kitResponse = await fetch(KIT_FORM_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Kit-Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email_address: email }),
    });

    const responseBody = await kitResponse.text();
    console.log(
      `[subscribe] Kit responded ${kitResponse.status} ${kitResponse.statusText}`,
    );
    console.log(`[subscribe] Kit response body: ${responseBody}`);

    let kitJson: unknown = null;
    try {
      kitJson = JSON.parse(responseBody);
    } catch {
      // Kit didn't return JSON — fall back to status code only.
    }

    // Kit can return HTTP 200 with a JSON error payload, so check both.
    const kitError =
      kitJson &&
      typeof kitJson === "object" &&
      "error" in (kitJson as Record<string, unknown>)
        ? String((kitJson as { error: unknown }).error)
        : null;

    if (!kitResponse.ok || kitError) {
      return Response.json(
        {
          error:
            kitError ?? "Subscription failed. Please try again.",
        },
        { status: kitResponse.ok ? 502 : kitResponse.status },
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
