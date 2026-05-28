// Mint a single-use private founder-access token and print the link.
//
// Usage (Node 20+):
//   node --env-file=.env.local scripts/mint-founder-access.mjs [founderNumber] [note]
//
// Defaults to founder #101. The token unlocks the $8 founder floor at
// /membership?access=<token>; on a successful checkout the webhook
// assigns the founder number directly (no counter touch — public stays
// 100/100) and consumes the token so the link can't be reused.

import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";

const founderNumber = Number(process.argv[2] ?? 101);
const note = process.argv[3] ?? `honored founder #${founderNumber} grant`;

if (!Number.isFinite(founderNumber) || founderNumber <= 0) {
  console.error(`Invalid founder number: ${process.argv[2]}`);
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const accessToken = randomBytes(24).toString("base64url");
const rec = {
  createdAt: Date.now(),
  note,
  founderNumber,
  usedAt: null,
  usedByEmail: null,
};
await redis.set(`founder-access:${accessToken}`, JSON.stringify(rec));

const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
console.log(`Minted single-use founder-access token (Founder #${founderNumber}).`);
console.log(`  note: ${note}`);
console.log("");
console.log("PROD link to hand out:");
console.log(`  https://stopbeingprey.com/membership?access=${accessToken}`);
if (base && !base.includes("stopbeingprey.com")) {
  console.log("");
  console.log("Local test link:");
  console.log(`  ${base}/membership?access=${accessToken}`);
}
