// Mint a no-login BILLING RECOVERY link for a member and print it, to
// paste into a personal email. Drops the member straight onto Stripe's
// card-update page (via /billing/fix) with no sign-in required. For
// members whose card failed: a past_due member historically could NOT
// request a sign-in link, so this is the reliable rescue path.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/mint-billing-fix.mjs <email>
//
// Mints the SAME token the invoice.payment_failed webhook emails
// (signBillingToken in src/lib/auth.ts): a jose HS256 JWT signed with
// AUTH_SECRET, payload { purpose: "billing-recovery", customerId }, 30-day
// expiry. Stateless (no Redis write) and reusable until it expires.

import { Redis } from "@upstash/redis";
import { SignJWT } from "jose";

const email = (process.argv[2] ?? "").toLowerCase().trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: mint-billing-fix.mjs <email>");
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !redisToken) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const authSecret = process.env.AUTH_SECRET;
if (!authSecret) {
  console.error("Missing AUTH_SECRET (needed to sign the recovery token).");
  process.exit(1);
}

const redis = new Redis({ url, token: redisToken });

// Live member record (unprefixed key = production keyspace).
const raw = await redis.get(`member:${email}`);
const member =
  typeof raw === "string"
    ? JSON.parse(raw)
    : raw && typeof raw === "object"
      ? raw
      : null;

if (!member) {
  console.error(`No member on file for ${email}.`);
  console.error(
    "Check the exact address with: node --env-file=.env.local scripts/inspect-member.mjs <email>"
  );
  process.exit(1);
}
const customerId = member.stripeCustomerId;
if (!customerId || !String(customerId).startsWith("cus_")) {
  console.error(
    `Member ${email} has no real Stripe customer id (got ${customerId}); ` +
      "a portal session can't be opened, so a billing-fix link won't work."
  );
  process.exit(1);
}

const token = await new SignJWT({ purpose: "billing-recovery", customerId })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("30d")
  .sign(new TextEncoder().encode(authSecret));

console.log(`Minted billing-recovery link for ${email}.`);
console.log(`  customer: ${customerId}`);
console.log(`  status:   ${member.status}`);
console.log("  expires in: 30 days (reusable until then)");
console.log("");
console.log("Paste this into a personal email to the member:");
console.log(
  `  https://stopbeingprey.com/billing/fix?token=${encodeURIComponent(token)}`
);
