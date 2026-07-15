// READ-ONLY. Lists every member whose subscription is in a card-failed /
// delinquent state (past_due, unpaid, incomplete) — the exact members who
// could NOT sign in under the old gate. Answers "how many are stuck?" and
// gives the emails to mint recovery links for. No writes, ever.
//
//   node --env-file=.env.local scripts/scan-delinquent.mjs

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const STUCK = new Set(["past_due", "unpaid", "incomplete"]);

function parse(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// members:all is a zset of member emails (score = created-at).
const emails = (await redis.zrange("members:all", 0, -1)) ?? [];
console.log(`Scanned ${emails.length} member records.\n`);

const stuck = [];
for (const email of emails) {
  const m = parse(await redis.get(`member:${email}`));
  if (m && STUCK.has(m.status)) {
    stuck.push({
      email,
      status: m.status,
      tier: m.tier,
      customer: m.stripeCustomerId,
      updatedAt: m.updatedAt,
    });
  }
}

if (stuck.length === 0) {
  console.log("No members are currently in a delinquent state.");
} else {
  stuck.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  console.log(`${stuck.length} member(s) stuck (card failed / delinquent):\n`);
  for (const s of stuck) {
    const when = s.updatedAt
      ? new Date(s.updatedAt).toISOString().slice(0, 10)
      : "unknown";
    console.log(
      `  ${s.status.padEnd(11)} ${when}  ${s.tier.padEnd(8)} ${s.email}`
    );
  }
  console.log("\nMint a recovery link for each with:");
  console.log("  node --env-file=.env.local scripts/mint-billing-fix.mjs <email>");
}
