// Hand a Charter slot back for reissue.
//
//   node scripts/release-charter-slot.mjs <email>            (dry run)
//   node scripts/release-charter-slot.mjs <email> --confirm  (writes)
//
// For a REFUND or a mistaken charge. Not for an ordinary cancellation: a
// member who lapses and later returns through /reactivate is promised the
// same number back, and that path reads it off the record this clears.
//
// charter:claimed is a high-water mark and stays one. Decrementing it
// would reissue a number already stamped on somebody else's record, so
// the released number goes on the charter:freed list instead and the next
// purchase takes it ahead of a fresh one (see claimCharterSlot).

import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing Upstash env.");
  process.exit(1);
}

// Same rule as lib/members.ts. Scripts run outside production, so without
// an explicit MEMBERS_KEY_PREFIX="" this would read an empty dev sandbox
// and report every real member as missing.
const PREFIX = env.MEMBERS_KEY_PREFIX ?? "dev:";
const CAP = 100;

const email = (process.argv[2] || "").trim().toLowerCase();
const confirm = process.argv.includes("--confirm");
if (!email) {
  console.error("Usage: node scripts/release-charter-slot.mjs <email> [--confirm]");
  process.exit(1);
}

const redis = new Redis({ url, token });
const K = {
  member: `${PREFIX}member:${email}`,
  claimed: `${PREFIX}charter:claimed`,
  freed: `${PREFIX}charter:freed`,
};

const record = await redis.get(K.member);
if (!record) {
  console.error(`No member record for ${email} (keyspace "${PREFIX}").`);
  process.exit(1);
}

const claimed = Number(await redis.get(K.claimed)) || 0;
const freedBefore = await redis.lrange(K.freed, 0, -1);

console.log(`member    ${email}`);
console.log(`  tier=${record.tier} slot=${record.charterSlot ?? "-"} status=${record.status}`);
console.log(`  ${record.interval} $${((record.amountCents ?? 0) / 100).toFixed(0)} customer=${record.stripeCustomerId}`);
console.log(`counter   charter:claimed=${claimed} / ${CAP}`);
console.log(`freed     [${freedBefore.join(", ") || "empty"}]`);

if (record.tier !== "charter" || typeof record.charterSlot !== "number") {
  console.error(`\n${email} holds no charter slot. Nothing to release.`);
  process.exit(1);
}
if (freedBefore.map(String).includes(String(record.charterSlot))) {
  console.error(`\nSlot ${record.charterSlot} is already on the free list. Refusing to queue it twice.`);
  process.exit(1);
}

const slot = record.charterSlot;
console.log(`\nWould release charter #${slot}:`);
console.log(`  ${email}: tier charter -> regular, charterSlot ${slot} -> null`);
console.log(`  charter:freed <- ${slot}  (next purchase takes it)`);
console.log(`  charter:claimed stays ${claimed}; effective sold becomes ${claimed - (freedBefore.length + 1)}`);

if (!confirm) {
  console.log("\nDry run. Re-run with --confirm to write.");
  process.exit(0);
}

// Record first: if this died the other way round the number would be live
// on the free list while still stamped on a member, and two people would
// end up wearing charter #N.
await redis.set(K.member, {
  ...record,
  tier: "regular",
  charterSlot: null,
  updatedAt: Date.now(),
});
await redis.rpush(K.freed, String(slot));

const after = await redis.get(K.member);
const freedAfter = await redis.lrange(K.freed, 0, -1);
console.log(`\nDone.`);
console.log(`  ${email}: tier=${after.tier} slot=${after.charterSlot ?? "-"}`);
console.log(`  freed=[${freedAfter.join(", ")}]`);
console.log(`  charter:claimed=${Number(await redis.get(K.claimed)) || 0} (unchanged, by design)`);
