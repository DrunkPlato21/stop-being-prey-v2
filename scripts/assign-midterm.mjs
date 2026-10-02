// Assign the next Midterm slot to an EXISTING active member.
//
//   node scripts/assign-midterm.mjs <email> --prefix=dev:           (dry run, dev sandbox)
//   node scripts/assign-midterm.mjs <email> --prefix=               (dry run, LIVE keyspace)
//   node scripts/assign-midterm.mjs <email> --prefix= --apply       (writes, LIVE keyspace)
//
// For moving an existing patron into the Midterm class by hand (the
// first four $18 patrons become Midterm 1-4). Sets tier "midterm" and
// midtermSlot on their record. Does NOT touch Stripe: their price stays
// exactly what they pay now.
//
// The slot is claimed through the same counter the webhook uses
// (midterm:freed first, then the capped INCR on midterm:claimed), so
// numbering stays consistent with checkout-claimed slots and the cap of
// 50 is enforced in one place.
//
// --prefix is REQUIRED and must be explicit. It is the MEMBERS_KEY_PREFIX
// to operate on: "--prefix=" (empty) is the live production keyspace,
// "--prefix=dev:" is the local sandbox. There is deliberately no default
// and the env var is ignored, so a run can never land in a keyspace the
// operator did not name.

import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const CAP = 50;
const CLOSES_AT = "2026-11-04T07:59:59Z"; // keep in step with MIDTERM_CLOSES_AT in src/lib/members.ts

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const prefixArg = args.find((a) => a.startsWith("--prefix="));
const email = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();

if (!email) {
  console.error("Usage: node scripts/assign-midterm.mjs <email> --prefix=<MEMBERS_KEY_PREFIX> [--apply]");
  process.exit(1);
}
if (prefixArg === undefined) {
  console.error(
    'Refusing to run without an explicit --prefix. Use "--prefix=" for the LIVE keyspace or "--prefix=dev:" for the dev sandbox.'
  );
  process.exit(1);
}
const PREFIX = prefixArg.slice("--prefix=".length);

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing Upstash env.");
  process.exit(1);
}

const redis = new Redis({ url, token });
const K = {
  member: `${PREFIX}member:${email}`,
  claimed: `${PREFIX}midterm:claimed`,
  freed: `${PREFIX}midterm:freed`,
};

console.log(`keyspace  ${PREFIX === "" ? "LIVE (no prefix)" : `"${PREFIX}"`}`);

const record = await redis.get(K.member);
if (!record) {
  console.error(`No member record for ${email} in this keyspace.`);
  process.exit(1);
}

const claimed = Number(await redis.get(K.claimed)) || 0;
const freed = await redis.lrange(K.freed, 0, -1);

console.log(`member    ${email}`);
console.log(`  tier=${record.tier} status=${record.status} ${record.interval} $${((record.amountCents ?? 0) / 100).toFixed(2)}`);
console.log(`  founderSlot=${record.founderSlot ?? "-"} charterSlot=${record.charterSlot ?? "-"} midtermSlot=${record.midtermSlot ?? "-"}`);
console.log(`counter   midterm:claimed=${claimed} / ${CAP}`);
console.log(`freed     [${freed.join(", ") || "empty"}]`);

if (record.status !== "active" && record.status !== "trialing") {
  console.error(`\n${email} is not an active member (status ${record.status}). Refusing.`);
  process.exit(1);
}
if (record.tier === "founder" || record.tier === "charter" || record.tier === "midterm") {
  console.error(`\n${email} already holds a numbered class (${record.tier}). Refusing.`);
  process.exit(1);
}
if (Date.now() >= Date.parse(CLOSES_AT)) {
  console.warn(`\nWARNING: the Midterm class closed at ${CLOSES_AT}. Continuing because this is a manual assignment.`);
}

const nextSlot = freed.length > 0 ? Number(freed[0]) : claimed + 1;
if (freed.length === 0 && claimed >= CAP) {
  console.error(`\nMidterm class is full (${claimed} / ${CAP}). Refusing.`);
  process.exit(1);
}

console.log(`\nWould assign midterm #${nextSlot}:`);
console.log(`  ${email}: tier ${record.tier} -> midterm, midtermSlot -> ${nextSlot}`);
console.log(
  freed.length > 0
    ? `  midterm:freed -> pop ${nextSlot}`
    : `  midterm:claimed ${claimed} -> ${claimed + 1}`
);
console.log("  Stripe: untouched. Price stays as is.");

if (!apply) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

// Same claim as claimMidtermSlot in src/lib/members.ts: freed list first
// (LPOP is atomic), then the capped INCR in one Lua round-trip.
let slot = null;
const reissued = await redis.lpop(K.freed);
if (reissued !== null && reissued !== undefined) {
  const n = Number(reissued);
  if (Number.isFinite(n) && n > 0 && n <= CAP) slot = n;
}
if (slot === null) {
  const result = await redis.eval(
    `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local cap = tonumber(ARGV[1])
    if current >= cap then
      return -1
    end
    return redis.call('INCR', KEYS[1])
  `,
    [K.claimed],
    [String(CAP)]
  );
  if (typeof result === "number" && result > 0) slot = result;
}
if (slot === null) {
  console.error("\nClaim failed: Midterm class is full. Nothing written.");
  process.exit(1);
}

await redis.set(K.member, {
  ...record,
  tier: "midterm",
  midtermSlot: slot,
  updatedAt: Date.now(),
});

const after = await redis.get(K.member);
console.log(`\nDone.`);
console.log(`  ${email}: tier=${after.tier} midtermSlot=${after.midtermSlot}`);
console.log(`  midterm:claimed=${Number(await redis.get(K.claimed)) || 0}`);
