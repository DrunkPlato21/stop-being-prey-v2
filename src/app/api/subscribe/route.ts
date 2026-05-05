import type { NextRequest } from "next/server";

// Server-side proxy to Kit's subscription endpoint. The browser hits this
// same-origin route to avoid CORS; we forward server-to-server to Kit.
//
// 9402960 is the SBP form's numeric ID. The alphanumeric value Kit shows
// in its embed UI (e.g. 6d65bbd568) is the form's UID/embed token, not
// what the /subscriptions endpoint expects.
const KIT_FORM_ENDPOINT = "https://app.kit.com/forms/9402960/subscriptions";

export async function POST(request: NextRequest) {
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

  const formData = new URLSearchParams();
  formData.append("email_address", email);

  try {
    const kitResponse = await fetch(KIT_FORM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: formData.toString(),
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
