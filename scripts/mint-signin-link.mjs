// Mint a single-use PRODUCTION sign-in link for an existing member and
// print it, to paste into a personal email. For members whose automated
// sign-in email doesn't land, or who can't work the request-a-link form.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/mint-signin-link.mjs <email> [days]
//
// Defaults to a 7-day link. The token is stored at magic:<uuid> in the
// shared Redis (same keyspace prod reads — magic links are NOT dev-
// prefixed), so the link works against the live callback immediately.
// First click logs the member in and burns the token.

import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

const email = (process.argv[2] ?? "").toLowerCase().trim();
const days = Number(process.argv[3] ?? 7);

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: mint-signin-link.mjs <email> [days]");
  process.exit(1);
}
if (!Number.isFinite(days) || days <= 0) {
  console.error(`Invalid days: ${process.argv[3]}`);
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

// Read the live member record (unprefixed key = production keyspace).
const raw = await redis.get(`member:${email}`);
const member =
  typeof raw === "string" ? JSON.parse(raw) : raw && typeof raw === "object" ? raw : null;

if (!member) {
  console.error(`No member on file for ${email}.`);
  console.error(
    "Check the exact address with: node --env-file=.env.local scripts/inspect-member.mjs <email>"
  );
  process.exit(1);
}
if (!member.stripeCustomerId) {
  console.error(`Member ${email} has no stripeCustomerId; can't mint a session.`);
  process.exit(1);
}

// Record shape must match MagicLinkRecord in src/lib/auth.ts so the
// callback's consumeMagicLink can build the session.
const record = {
  email,
  customerId: member.stripeCustomerId,
  next: "/desk",
};

const id = randomUUID();
await redis.set(`magic:${id}`, JSON.stringify(record), {
  ex: 60 * 60 * 24 * days,
});

console.log(`Minted single-use sign-in link for ${email}.`);
console.log(`  expires in: ${days} day${days === 1 ? "" : "s"}`);
console.log("");
console.log("Paste this into a personal email to the member:");
console.log(`  https://stopbeingprey.com/api/auth/callback?token=${encodeURIComponent(id)}`);
