import type { NextRequest } from "next/server";
import { subscribeToList } from "@/lib/kit";
import { emailProblem, normalizeEmail } from "@/lib/email-guard";

// Server-side proxy to Kit's authenticated v4 API. The browser hits this
// same-origin route to avoid CORS; we forward server-to-server. The actual
// two-step subscribe (create subscriber, then attach to the SBP form) lives
// in subscribeToList so /api/subscribe and the Rules unlock action share
// one code path and one form ID.

export async function POST(request: NextRequest) {
  if (!process.env.KIT_API_KEY) {
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
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = normalizeEmail((body as { email_address?: unknown })?.email_address);
  const problem = emailProblem(email);
  if (problem === "format") {
    return Response.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }
  if (problem === "disposable") {
    return Response.json(
      { error: "Please use a real email address you check." },
      { status: 400 },
    );
  }

  try {
    const result = await subscribeToList(email);
    if (!result.ok) {
      console.error(
        `[subscribe] Kit subscribe failed: ${result.reason}` +
          (result.status ? ` (${result.status}) ${result.body ?? ""}` : ""),
      );
      return Response.json(
        { error: "Subscription failed. Please try again." },
        { status: result.status ?? 502 },
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
