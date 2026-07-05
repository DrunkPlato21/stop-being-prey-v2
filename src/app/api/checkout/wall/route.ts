import Stripe from "stripe";
import type { NextRequest } from "next/server";
import { getWallBySlug } from "@/lib/walls";

// Lazy init: constructing Stripe at module load throws when the key is
// absent (e.g. during the build's page-data collection), so defer it.
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2026-04-22.dahlia",
    });
  }
  return stripeClient;
}

const baseUrl = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

const NAME_MAX = 80;
const NOTE_MAX = 280;

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json(
      { error: "Stripe is not configured." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const b = body as {
    wall_slug?: unknown;
    amount?: unknown;
    name?: unknown;
    note?: unknown;
    anonymous?: unknown;
    show_amount?: unknown;
  };

  const wallSlug = typeof b.wall_slug === "string" ? b.wall_slug.trim() : "";
  if (!wallSlug) {
    return Response.json({ error: "Missing wall_slug." }, { status: 400 });
  }

  const wall = await getWallBySlug(wallSlug);
  if (!wall) {
    return Response.json({ error: "Unknown wall." }, { status: 404 });
  }
  if (wall.status !== "active") {
    return Response.json(
      { error: "This wall is closed to new donations." },
      { status: 409 }
    );
  }

  if (typeof b.amount !== "number" || !Number.isFinite(b.amount)) {
    return Response.json(
      { error: "Amount must be a number." },
      { status: 400 }
    );
  }
  if (b.amount < 1 || b.amount > 10000) {
    return Response.json(
      { error: "Amount must be between $1 and $10,000." },
      { status: 400 }
    );
  }

  const note =
    typeof b.note === "string" ? b.note.trim().slice(0, NOTE_MAX) : "";
  if (!note) {
    return Response.json(
      { error: "A note is required to back the wall." },
      { status: 400 }
    );
  }

  const anonymous = b.anonymous === true;
  const showAmount = b.show_amount === true;
  const name = anonymous
    ? ""
    : typeof b.name === "string"
      ? b.name.trim().slice(0, NAME_MAX)
      : "";

  const unitAmount = Math.round(b.amount * 100);

  // Stash all the data we need on the webhook side in Stripe metadata.
  // Booleans become "true"/"false" strings since Stripe metadata is
  // string-only.
  const metadata: Record<string, string> = {
    // `site` scopes this event to SBP; the shared Stripe account delivers
    // every event to both sites' webhooks, so each filters on this marker.
    site: "sbp",
    wall_slug: wallSlug,
    note,
    anonymous: anonymous ? "true" : "false",
    show_amount: showAmount ? "true" : "false",
  };
  if (name) metadata.donor_name = name;

  const description = name
    ? `Wall backer ${name} · ${wall.title}`
    : `Wall backer · ${wall.title}`;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      submit_type: "donate",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Predator Wall · ${wall.title}`,
              description: "Reader-funded structural takedown.",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: {
        description,
        metadata,
      },
      success_url: `${baseUrl}/walls/${wallSlug}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/walls/${wallSlug}`,
    });

    if (!session.url) {
      return Response.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }
    return Response.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to create checkout session.";
    return Response.json({ error: message }, { status: 500 });
  }
}
