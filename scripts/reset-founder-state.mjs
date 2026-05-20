// Reset the founder + charter slot counters and clean up test member
// records.
//
// One-shot script for pre-launch hygiene: dev work has been writing to
// the same Upstash instance that will serve production, so any test
// claims (DEV_AUTO_GRANT founder, test-mode Stripe checkouts) leave a
// trail in Redis. Run this before going live so the first real
// founder gets slot #1.
//
// Usage (Node 20+ has built-in --env-file):
//
//   node --env-file=.env.local scripts/reset-founder-state.mjs
//   node --env-file=.env.local scripts/reset-founder-state.mjs --execute
//
// What it does (in --execute mode):
//   1. DEL founder:claimed AND charter:claimed (counters reset to 0)
//   2. For every email in members:all:
//        - fetch member:<email>
//        - DEL member:<email>
//        - DEL member:by-customer:<stripeCustomerId>
//        - DEL member:by-session:<stripeSessionId> (best-effort, the
//          session id is not stored on the member record so this is
//          only cleaned if we encounter the reverse-index key in the
//          scan below)
//   3. DEL members:all (the index)
//   4. SCAN for member:by-session:* and DEL each
//
// This is destructive. Only run when you're sure all current member
// records are test data.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env. " +
      "Make sure your .env.local has them and you ran via Next loader, " +
      "or load dotenv explicitly."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

const FOUNDER_KEY = "founder:claimed";
const CHARTER_KEY = "charter:claimed";
const MEMBER_PREFIX = "member:";
const MEMBER_BY_CUSTOMER_PREFIX = "member:by-customer:";
const MEMBER_BY_SESSION_PREFIX = "member:by-session:";
const MEMBERS_ALL_INDEX = "members:all";

const execute = process.argv.includes("--execute");

function fmt(rec) {
  return {
    email: rec?.email,
    tier: rec?.tier,
    founderSlot: rec?.founderSlot,
    charterSlot: rec?.charterSlot,
    status: rec?.status,
    stripeCustomerId: rec?.stripeCustomerId,
    stripeSubscriptionId: rec?.stripeSubscriptionId,
    amountCents: rec?.amountCents,
    createdAt: rec?.createdAt
      ? new Date(rec.createdAt).toISOString()
      : null,
  };
}

async function scanKeys(matchPattern) {
  const out = [];
  let cursor = "0";
  do {
    const res = await redis.scan(cursor, { match: matchPattern, count: 100 });
    cursor = res[0];
    const keys = res[1];
    for (const k of keys) out.push(k);
  } while (cursor !== "0" && cursor !== 0);
  return out;
}

async function main() {
  console.log(`Mode: ${execute ? "EXECUTE (will modify Redis)" : "READ-ONLY inspect"}`);
  console.log("");

  // 1. Founder + Charter counters
  const counterRaw = await redis.get(FOUNDER_KEY);
  console.log(`founder:claimed = ${counterRaw ?? "(unset)"}`);
  const charterRaw = await redis.get(CHARTER_KEY);
  console.log(`charter:claimed = ${charterRaw ?? "(unset)"}`);
  console.log("");

  // 2. Members in the index
  const memberEmails = await redis.zrange(MEMBERS_ALL_INDEX, 0, -1);
  console.log(
    `members:all index has ${memberEmails.length} email(s):`
  );
  if (memberEmails.length > 0) {
    for (const email of memberEmails) {
      const rec = await redis.get(`${MEMBER_PREFIX}${email}`);
      console.log("  - " + JSON.stringify(fmt(rec)));
    }
  }
  console.log("");

  // 3. Loose by-session reverse index keys
  const sessionKeys = await scanKeys(`${MEMBER_BY_SESSION_PREFIX}*`);
  console.log(`member:by-session:* keys: ${sessionKeys.length}`);
  for (const k of sessionKeys) {
    console.log("  - " + k);
  }
  console.log("");

  // 4. Loose by-customer reverse index keys
  const customerKeys = await scanKeys(`${MEMBER_BY_CUSTOMER_PREFIX}*`);
  console.log(`member:by-customer:* keys: ${customerKeys.length}`);
  for (const k of customerKeys) {
    console.log("  - " + k);
  }
  console.log("");

  if (!execute) {
    console.log("(read-only mode — no changes made. Re-run with --execute to clean up.)");
    return;
  }

  // === Cleanup ===

  console.log("Cleaning up...");

  // Delete each member record + collect reverse index keys
  for (const email of memberEmails) {
    const rec = await redis.get(`${MEMBER_PREFIX}${email}`);
    await redis.del(`${MEMBER_PREFIX}${email}`);
    console.log(`  DEL member:${email}`);
    if (rec?.stripeCustomerId) {
      await redis.del(`${MEMBER_BY_CUSTOMER_PREFIX}${rec.stripeCustomerId}`);
      console.log(`  DEL member:by-customer:${rec.stripeCustomerId}`);
    }
  }

  // Delete loose reverse index keys not associated with surviving members
  for (const k of sessionKeys) {
    await redis.del(k);
    console.log(`  DEL ${k}`);
  }
  for (const k of customerKeys) {
    await redis.del(k);
    console.log(`  DEL ${k}`);
  }

  // Drop the index ZSET
  await redis.del(MEMBERS_ALL_INDEX);
  console.log(`  DEL ${MEMBERS_ALL_INDEX}`);

  // Reset the counters
  await redis.del(FOUNDER_KEY);
  console.log(`  DEL ${FOUNDER_KEY}`);
  await redis.del(CHARTER_KEY);
  console.log(`  DEL ${CHARTER_KEY}`);

  console.log("");
  console.log("Done. Verifying...");
  console.log("");

  const counterAfter = await redis.get(FOUNDER_KEY);
  const charterAfter = await redis.get(CHARTER_KEY);
  const emailsAfter = await redis.zrange(MEMBERS_ALL_INDEX, 0, -1);
  console.log(`founder:claimed = ${counterAfter ?? "(unset, treated as 0)"}`);
  console.log(`charter:claimed = ${charterAfter ?? "(unset, treated as 0)"}`);
  console.log(`members:all has ${emailsAfter.length} email(s)`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
