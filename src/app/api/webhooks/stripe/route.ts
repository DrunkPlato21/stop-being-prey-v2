import Stripe from "stripe";
import type { NextRequest } from "next/server";
import {
  createEntry,
  formatAttribution,
  isStorageConfigured,
  type AttributionPreference,
} from "@/lib/supporters";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-04-22.dahlia",
});

const allowedAttribution = new Set<AttributionPreference>([
  "full",
  "first_last_initial",
  "first",
  "anonymous",
]);

function parseAttribution(value: string | undefined): AttributionPreference {
  if (value && allowedAttribution.has(value as AttributionPreference)) {
    return value as AttributionPreference;
  }
  return "first";
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return new Response("Stripe webhook is not configured.", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header.", { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("ok", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};

  if (metadata.display_publicly !== "true") {
    return new Response("ok", { status: 200 });
  }

  const message = (metadata.donor_message ?? "").trim();
  if (!message) {
    return new Response("ok", { status: 200 });
  }

  if (!isStorageConfigured()) {
    console.warn(
      "[supporters] webhook fired but storage is not configured; skipping write"
    );
    return new Response("ok", { status: 200 });
  }

  const attribution = formatAttribution(
    parseAttribution(metadata.attribution_preference),
    metadata.donor_name,
    metadata.city
  );

  try {
    await createEntry({
      id: session.id,
      timestamp: (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
      message,
      attribution,
      source: "stripe",
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[supporters] failed to persist entry: ${reason}`);
    return new Response(`storage error: ${reason}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
