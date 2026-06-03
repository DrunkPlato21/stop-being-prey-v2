import Stripe from "stripe";
import type { NextRequest } from "next/server";

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
    return Response.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const amount = (body as { amount?: unknown })?.amount;
  const rawName = (body as { name?: unknown })?.name;
  const rawMessage = (body as { message?: unknown })?.message;
  const rawDisplay = (body as { display_publicly?: unknown })?.display_publicly;
  const rawAttribution = (body as { attribution_preference?: unknown })
    ?.attribution_preference;
  const rawCity = (body as { city?: unknown })?.city;

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return Response.json(
      { error: "Amount must be a number." },
      { status: 400 }
    );
  }

  if (amount < 1 || amount > 10000) {
    return Response.json(
      { error: "Amount must be between $1 and $10,000." },
      { status: 400 }
    );
  }

  const donorName =
    typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";
  const donorMessage =
    typeof rawMessage === "string" ? rawMessage.trim().slice(0, 500) : "";
  const displayPublicly = rawDisplay === true;
  const allowedAttribution = new Set([
    "full",
    "first_last_initial",
    "first",
    "anonymous",
  ]);
  const attributionPreference =
    typeof rawAttribution === "string" && allowedAttribution.has(rawAttribution)
      ? rawAttribution
      : "first";
  const donorCity =
    typeof rawCity === "string" ? rawCity.trim().slice(0, 80) : "";

  const descriptionParts: string[] = [];
  descriptionParts.push(donorName ? `Tip from ${donorName}` : "Tip");
  if (donorMessage) descriptionParts.push(donorMessage.slice(0, 180));
  const description = descriptionParts.join(" · ");

  const donorMetadata: Record<string, string> = {};
  if (donorName) donorMetadata.donor_name = donorName;
  if (donorMessage) donorMetadata.donor_message = donorMessage;
  if (displayPublicly) {
    donorMetadata.display_publicly = "true";
    donorMetadata.attribution_preference = attributionPreference;
    if (attributionPreference === "full" && donorCity) {
      donorMetadata.city = donorCity;
    }
  }
  const hasDonorData = Object.keys(donorMetadata).length > 0;

  const unitAmount = Math.round(amount * 100);

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
              name: "Support Stop Being Prey",
              description: "Reader-supported.",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      ...(hasDonorData
        ? {
            metadata: donorMetadata,
            payment_intent_data: {
              description,
              metadata: donorMetadata,
            },
          }
        : {}),
      success_url: `${baseUrl}/tip/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/tip`,
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
