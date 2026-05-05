import Stripe from "stripe";
import type { NextRequest } from "next/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

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
  const rawMessage = (body as { message?: unknown })?.message;

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

  const donorMessage =
    typeof rawMessage === "string" ? rawMessage.trim().slice(0, 500) : "";

  const unitAmount = Math.round(amount * 100);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      submit_type: "donate",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Support Stop Being Prey",
              description:
                "Reader-supported. No ads, no sponsors, no paywalls.",
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      ...(donorMessage
        ? {
            metadata: { donor_message: donorMessage },
            payment_intent_data: {
              description: `Tip · ${donorMessage.slice(0, 180)}`,
              metadata: { donor_message: donorMessage },
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
