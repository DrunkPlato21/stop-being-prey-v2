import Stripe from "stripe";
import type { NextRequest } from "next/server";
import {
  createEntry,
  formatAttribution,
  isStorageConfigured,
  type AttributionPreference,
} from "@/lib/supporters";
import {
  createDonation,
  isStorageConfigured as isWallStorageConfigured,
} from "@/lib/wallDonations";
import { getWallBySlug } from "@/lib/walls";
import { notifyNewWallDonation } from "@/lib/email";

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

  // Fork on session type. Wall donations carry a wall_slug; tip jar
  // sessions don't. Each lane writes to its own storage and runs its
  // own moderation rules.
  if (typeof metadata.wall_slug === "string" && metadata.wall_slug.length > 0) {
    return handleWallDonation(session, metadata);
  }
  return handleTipDonation(session, metadata);
}

async function handleTipDonation(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
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

async function handleWallDonation(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
): Promise<Response> {
  if (!isWallStorageConfigured()) {
    console.warn(
      "[walls] webhook fired but storage is not configured; skipping write"
    );
    return new Response("ok", { status: 200 });
  }

  const wallSlug = metadata.wall_slug;
  const note = (metadata.note ?? "").trim();
  if (!note) {
    console.warn("[walls] webhook fired without note; skipping write");
    return new Response("ok", { status: 200 });
  }

  const wall = await getWallBySlug(wallSlug);
  if (!wall) {
    console.warn(`[walls] webhook fired for unknown wall: ${wallSlug}`);
    return new Response("ok", { status: 200 });
  }

  const amountCents = session.amount_total ?? 0;

  try {
    const donation = await createDonation({
      id: session.id,
      wallSlug,
      timestamp: (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
      name: metadata.donor_name ?? "",
      amountCents,
      note,
      showAmount: metadata.show_amount === "true",
      anonymous: metadata.anonymous === "true",
      stripeSessionId: session.id,
    });
    if (donation) {
      // Fire-and-forget the notification — failure to email shouldn't
      // break the webhook ack.
      await notifyNewWallDonation(donation, wall.title);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[walls] failed to persist donation: ${reason}`);
    return new Response(`storage error: ${reason}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}
