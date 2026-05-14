// Dev-only utility: replay a Stripe event into our local webhook
// endpoint with a properly-signed header. Use when the Stripe CLI
// isn't forwarding (or you want to re-process without rerunning the
// CLI). Reads keys from .env.local.
//
// usage:  node scripts/replay-webhook.mjs <event_id>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Stripe from "stripe";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      if (i < 0) return null;
      return [l.slice(0, i), l.slice(i + 1)];
    })
    .filter(Boolean)
);

const stripeKey = env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? env.STRIPE_SECRET_KEY
  : null;
if (!stripeKey) {
  console.error(
    "STRIPE_SECRET_KEY in .env.local must be a sk_test_ key (found something else)."
  );
  process.exit(1);
}
const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.error("STRIPE_WEBHOOK_SECRET missing from .env.local");
  process.exit(1);
}

const eventId = process.argv[2];
if (!eventId) {
  console.error("usage: node scripts/replay-webhook.mjs <evt_id>");
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: "2026-04-22.dahlia" });
const event = await stripe.events.retrieve(eventId);
const payload = JSON.stringify(event);

const signature = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: webhookSecret,
});

const endpoint =
  (env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "") +
  "/api/webhooks/stripe";

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "stripe-signature": signature,
    "content-type": "application/json",
  },
  body: payload,
});
const text = await res.text();
console.log(`${res.status} ${res.statusText} :: ${text}`);
