// Regression test for the Community Seat Pool match engine (lib/pool.ts).
//
// This locks in the money logic: a funded seat goes to exactly one
// person, the waitlist is FIFO, the counters stay consistent, and under
// concurrent fire no seat is double-spent and no waiter is matched twice
// (the two atomic Lua scripts are the thing under test). If a future
// change breaks any of that, this fails loudly.
//
// Safe to run against the shared dev Redis: it forces its OWN isolated
// key namespace (`seatpooltest:`), touches NO member records and NO
// Stripe, and wipes its keys before and after. Reads UPSTASH creds from
// .env.local.
//
// Run:  npm run test:seat-pool
// Exit: 0 if every assertion passes, 1 otherwise.

import { readFileSync } from "node:fs";
import { Redis } from "@upstash/redis";

// Load .env.local BEFORE importing pool.ts (it reads its key prefix +
// Redis creds from env at module load). Force an isolated test keyspace.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const TEST_PREFIX = "seatpooltest:";
process.env.POOL_KEY_PREFIX = TEST_PREFIX;

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error("Missing UPSTASH creds in .env.local; cannot run.");
  process.exit(1);
}

const raw = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function wipe() {
  const keys = await raw.keys(`${TEST_PREFIX}*`);
  if (keys.length) await raw.del(...keys);
}

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
}

const pool = await import("../src/lib/pool.ts");

async function fundOne(months: 3 | 12 = 3): Promise<string> {
  const f = await pool.createPoolFund({
    buyerName: null,
    message: null,
    termMonths: months,
    amountCents: months === 3 ? 3900 : 13000,
  });
  await pool.markPoolFunded(f!.id, {
    buyerEmail: null,
    buyerName: null,
    stripePaymentIntentId: null,
  });
  return f!.id;
}

async function main() {
  await wipe();

  // --- [1] fund -> available -> claim grants + decrements available ---
  console.log("\n[1] Fund a seat, then claim it (seat available)");
  const f1 = await fundOne(3);
  const place1 = await pool.placeFundedSeat(f1);
  check("placing a seat with no waiters -> queued", place1.kind === "queued");
  let s = await pool.getPoolStats();
  check(
    "after fund: funded=1 claimed=0 available=1 waiting=0",
    s.funded === 1 && s.claimed === 0 && s.available === 1 && s.waiting === 0,
    JSON.stringify(s)
  );
  const r1 = await pool.createPoolRequest({ email: "claimerA@test", note: "x" });
  const c1 = await pool.claimSeatOrWaitlist(r1!.id);
  check(
    "claim with seat available -> granted with that seat's id",
    c1.kind === "granted" && c1.fundId === f1,
    JSON.stringify(c1)
  );
  s = await pool.getPoolStats();
  check(
    "after claim: funded=1 claimed=1 available=0 waiting=0 (available decremented)",
    s.funded === 1 && s.claimed === 1 && s.available === 0 && s.waiting === 0,
    JSON.stringify(s)
  );

  // --- [2] claim when empty -> waitlist; fund -> auto-match ---
  await wipe();
  console.log("\n[2] Claim when pool empty (waitlist), then fund (auto-match)");
  const rB = await pool.createPoolRequest({ email: "claimerB@test", note: null });
  const cB = await pool.claimSeatOrWaitlist(rB!.id);
  check("claim with empty pool -> waitlisted", cB.kind === "waitlisted");
  s = await pool.getPoolStats();
  check(
    "funded=0 claimed=0 available=0 waiting=1",
    s.funded === 0 && s.claimed === 0 && s.available === 0 && s.waiting === 1,
    JSON.stringify(s)
  );
  const f2 = await fundOne(12);
  const place2 = await pool.placeFundedSeat(f2);
  check(
    "funding with a waiter present -> matched to the front waiter",
    place2.kind === "matched" && place2.requestId === rB!.id,
    JSON.stringify(place2)
  );
  s = await pool.getPoolStats();
  check(
    "after match: funded=1 claimed=1 available=0 waiting=0",
    s.funded === 1 && s.claimed === 1 && s.available === 0 && s.waiting === 0,
    JSON.stringify(s)
  );

  // --- [3] waitlist is FIFO ---
  await wipe();
  console.log("\n[3] Waitlist is FIFO (first in line gets the next seat)");
  const w1 = await pool.createPoolRequest({ email: "first@test", note: null });
  const w2 = await pool.createPoolRequest({ email: "second@test", note: null });
  await pool.claimSeatOrWaitlist(w1!.id);
  await pool.claimSeatOrWaitlist(w2!.id);
  const m1 = await pool.placeFundedSeat(await fundOne(3));
  check("first funded seat -> first waiter", m1.kind === "matched" && m1.requestId === w1!.id, JSON.stringify(m1));
  const m2 = await pool.placeFundedSeat(await fundOne(3));
  check("second funded seat -> second waiter", m2.kind === "matched" && m2.requestId === w2!.id, JSON.stringify(m2));

  // --- [4] collision: many claims, few seats, no double-spend ---
  await wipe();
  console.log("\n[4] Collision: 5 seats, 20 simultaneous claims -> 5 distinct grants");
  const seats: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = await fundOne(3);
    await pool.placeFundedSeat(id);
    seats.push(id);
  }
  const reqs = [];
  for (let i = 0; i < 20; i++) reqs.push(await pool.createPoolRequest({ email: `race${i}@test`, note: null }));
  const outcomes = await Promise.all(reqs.map((r) => pool.claimSeatOrWaitlist(r!.id)));
  const granted = outcomes.filter((o) => o.kind === "granted") as { kind: "granted"; fundId: string }[];
  const waitlisted = outcomes.filter((o) => o.kind === "waitlisted");
  const grantedIds = granted.map((g) => g.fundId);
  const distinct = new Set(grantedIds);
  check("exactly 5 claims granted", granted.length === 5, `got ${granted.length}`);
  check("exactly 15 claims waitlisted", waitlisted.length === 15, `got ${waitlisted.length}`);
  check(
    "each granted seat id is DISTINCT (no seat handed to two people)",
    distinct.size === granted.length && grantedIds.every((id) => seats.includes(id)),
    `distinct=${distinct.size} of ${granted.length}`
  );
  s = await pool.getPoolStats();
  check(
    "funded=5 claimed=5 available=0 waiting=15",
    s.funded === 5 && s.claimed === 5 && s.available === 0 && s.waiting === 15,
    JSON.stringify(s)
  );

  // --- [5] collision: many funds, few waiters, no double-match ---
  await wipe();
  console.log("\n[5] Collision: 5 waiters, 20 simultaneous funds -> 5 distinct matches");
  const waiters = [];
  for (let i = 0; i < 5; i++) {
    const r = await pool.createPoolRequest({ email: `wait${i}@test`, note: null });
    await pool.claimSeatOrWaitlist(r!.id);
    waiters.push(r);
  }
  const fundIds: string[] = [];
  for (let i = 0; i < 20; i++) fundIds.push(await fundOne(3));
  const placements = await Promise.all(fundIds.map((id) => pool.placeFundedSeat(id)));
  const matched = placements.filter((p) => p.kind === "matched") as { kind: "matched"; requestId: string }[];
  const queued = placements.filter((p) => p.kind === "queued");
  const matchedReqs = matched.map((m) => m.requestId);
  const distinctReqs = new Set(matchedReqs);
  check("exactly 5 funds matched a waiter", matched.length === 5, `got ${matched.length}`);
  check("exactly 15 funds queued as available", queued.length === 15, `got ${queued.length}`);
  check(
    "each matched request id is DISTINCT (no waiter matched twice)",
    distinctReqs.size === matched.length && matchedReqs.every((id) => waiters.some((w) => w!.id === id)),
    `distinct=${distinctReqs.size} of ${matched.length}`
  );
  s = await pool.getPoolStats();
  check(
    "funded=20 claimed=5 available=15 waiting=0",
    s.funded === 20 && s.claimed === 5 && s.available === 15 && s.waiting === 0,
    JSON.stringify(s)
  );

  await wipe();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test threw:", err);
  process.exit(1);
});
