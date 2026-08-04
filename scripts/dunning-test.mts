// Regression test for the failed-renewal email sequence (lib/dunning.ts).
//
// This locks in the fix for the nine-identical-emails bug: Stripe fires
// invoice.payment_failed on EVERY retry in its dunning window, and the
// member must come out of that with at most three emails, the last of
// which is the only one that says the seat is closing.
//
// What's under test: the pure stage machine across a real Stripe retry
// sequence, the atomic claim (a webhook redelivery must not double-send),
// the hard-decline path where there was never a retry to begin with, and
// the reset when an invoice finally clears.
//
// Safe to run against the shared dev Redis: it forces its OWN isolated
// key namespace (`dunningtest:`), touches NO member records, sends NO
// email and calls NO Stripe. Wipes its keys before and after.
//
// Run:  npm run test:dunning
// Exit: 0 if every assertion passes, 1 otherwise.

import { readFileSync } from "node:fs";
import { Redis } from "@upstash/redis";

// Load .env.local BEFORE importing dunning.ts (it reads its key prefix
// and Redis creds from env at module load). Force an isolated keyspace.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const TEST_PREFIX = "dunningtest:";
process.env.BILLING_KEY_PREFIX = TEST_PREFIX;

if (
  !process.env.UPSTASH_REDIS_REST_URL ||
  !process.env.UPSTASH_REDIS_REST_TOKEN
) {
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

const dunning = await import("../src/lib/dunning.ts");
type Stage = Awaited<ReturnType<typeof dunning.claimFailureStage>>;

const DAY = 86400;
const T0 = 1785823656; // fixed clock, no Date.now() in assertions

async function main() {
  await wipe();

  // --- [1] a full Stripe retry window yields exactly three emails ---
  // Mirrors the real cadence that hit eatdawg@gmail.com: 9 attempts over
  // roughly two weeks, each one its own invoice.payment_failed event.
  console.log("\n[1] Full retry window (9 attempts) -> 3 emails");
  const inv1 = "in_test_window";
  const schedule: Array<number | null> = [
    T0 + 2 * DAY,
    T0 + 4 * DAY,
    T0 + 6 * DAY,
    T0 + 8 * DAY,
    T0 + 10 * DAY,
    T0 + 12 * DAY,
    T0 + 14 * DAY,
    T0 + 16 * DAY,
    null, // Stripe gives up
  ];
  const got: Stage[] = [];
  for (let i = 0; i < schedule.length; i++) {
    got.push(
      await dunning.claimFailureStage({
        invoiceId: inv1,
        attemptCount: i + 1,
        nextPaymentAttempt: schedule[i],
      })
    );
  }
  const sent = got.filter(Boolean);
  check(
    "exactly 3 emails across 9 failed attempts",
    sent.length === 3,
    `got ${sent.length}: ${JSON.stringify(got)}`
  );
  check(
    "order is first -> nudge -> final",
    JSON.stringify(sent) === JSON.stringify(["first", "nudge", "final"]),
    JSON.stringify(sent)
  );
  check("attempt 1 sends the soft notice", got[0] === "first", String(got[0]));
  check("attempt 2 stays silent", got[1] === null, String(got[1]));
  check("attempt 3 sends the nudge", got[2] === "nudge", String(got[2]));
  check(
    "attempts 4 through 8 stay silent",
    got.slice(3, 8).every((s) => s === null),
    JSON.stringify(got.slice(3, 8))
  );
  check(
    "the last attempt sends the final notice",
    got[8] === "final",
    String(got[8])
  );

  // --- [2] webhook redelivery must not double-send ---
  console.log("\n[2] Stripe redelivers the same event");
  const inv2 = "in_test_redeliver";
  const a = await dunning.claimFailureStage({
    invoiceId: inv2,
    attemptCount: 1,
    nextPaymentAttempt: T0 + 2 * DAY,
  });
  const b = await dunning.claimFailureStage({
    invoiceId: inv2,
    attemptCount: 1,
    nextPaymentAttempt: T0 + 2 * DAY,
  });
  check("first delivery sends", a === "first", String(a));
  check("redelivery of the same event sends nothing", b === null, String(b));

  // --- [3] concurrent deliveries resolve to exactly one sender ---
  console.log("\n[3] Two retries landing at the same instant");
  const inv3 = "in_test_race";
  const racers = await Promise.all(
    Array.from({ length: 6 }, () =>
      dunning.claimFailureStage({
        invoiceId: inv3,
        attemptCount: 1,
        nextPaymentAttempt: T0 + 2 * DAY,
      })
    )
  );
  check(
    "exactly one of six concurrent claims wins",
    racers.filter(Boolean).length === 1,
    JSON.stringify(racers)
  );

  // --- [4] hard decline with no retry ever scheduled ---
  // A non-retryable decline code means Stripe never queues an attempt.
  // The member must still hear something, and it has to be the notice
  // that says the seat is closing, not the gentle one.
  console.log("\n[4] Hard decline, no retry ever scheduled");
  const inv4 = "in_test_harddecline";
  const only = await dunning.claimFailureStage({
    invoiceId: inv4,
    attemptCount: 1,
    nextPaymentAttempt: null,
  });
  check("goes straight to the final notice", only === "final", String(only));
  const after = await dunning.claimFailureStage({
    invoiceId: inv4,
    attemptCount: 2,
    nextPaymentAttempt: null,
  });
  check("and never repeats it", after === null, String(after));

  // --- [5] a cleared invoice resets the sequence ---
  console.log("\n[5] Invoice finally clears, then fails again months later");
  const inv5 = "in_test_recovered";
  await dunning.claimFailureStage({
    invoiceId: inv5,
    attemptCount: 1,
    nextPaymentAttempt: T0 + 2 * DAY,
  });
  await dunning.clearInvoiceDunning(inv5);
  const reopened = await dunning.claimFailureStage({
    invoiceId: inv5,
    attemptCount: 1,
    nextPaymentAttempt: T0 + 2 * DAY,
  });
  check(
    "next failure opens with the soft notice again",
    reopened === "first",
    String(reopened)
  );

  // --- [6] the win-back fires once per subscription ---
  console.log("\n[6] Subscription dies");
  const first = await dunning.claimLapse("sub_test_lapse");
  const second = await dunning.claimLapse("sub_test_lapse");
  check("one win-back on the dead subscription", first === true);
  check("never a second one", second === false);
  const other = await dunning.claimLapse("sub_test_lapse_again");
  check(
    "a later subscription for the same member gets its own",
    other === true
  );

  // --- [7] deployed mid-window, member already had the old email ---
  // The three members sitting in past_due when this ships have no stage
  // on record but have already been emailed. They must not be greeted
  // with the soft notice a second time.
  console.log("\n[7] Deploy lands mid retry window");
  const inv7 = "in_test_middeploy";
  const midA = await dunning.claimFailureStage({
    invoiceId: inv7,
    attemptCount: 2, // Stripe is already two attempts in
    nextPaymentAttempt: T0 + 4 * DAY,
  });
  check("no duplicate soft notice on a later attempt", midA === null, String(midA));
  const midB = await dunning.claimFailureStage({
    invoiceId: inv7,
    attemptCount: 3,
    nextPaymentAttempt: T0 + 6 * DAY,
  });
  check("picks the sequence up at the nudge", midB === "nudge", String(midB));
  const midC = await dunning.claimFailureStage({
    invoiceId: inv7,
    attemptCount: 4,
    nextPaymentAttempt: null,
  });
  check("and still lands the final notice", midC === "final", String(midC));

  await wipe();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("test threw:", err);
  process.exit(1);
});
