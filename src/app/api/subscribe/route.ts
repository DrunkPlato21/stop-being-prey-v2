import type { NextRequest } from "next/server";

// Server-side proxy to Kit's subscription endpoint. The browser hits this
// same-origin route to avoid CORS; we forward server-to-server to Kit.
//
// Temporary form ID: routing through the ReadSowell-branded Kit form
// (91813c2713) while the SBP form (6d65bbd568) is investigated by Kit
// support — it's silently operating in double-opt-in mode despite the UI
// showing single opt-in. Both forms land subscribers in the same list and
// trigger the same welcome automation, so this is a same-destination
// workaround. Swap back once the SBP form is fixed.
const KIT_FORM_ENDPOINT = "https://app.kit.com/forms/91813c2713/subscriptions";

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

  try {
    const kitResponse = await fetch(KIT_FORM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ email_address: email }).toString(),
    });

    if (!kitResponse.ok) {
      return Response.json(
        { error: "Subscription failed. Please try again." },
        { status: kitResponse.status },
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not reach the subscription service." },
      { status: 502 },
    );
  }
}
