// Regression test for the membership pricing floors (lib/pricing.ts).
//
// This is the highest-stakes number on the site: whatever a buyer pays
// at checkout is the rate they keep for life, so a floor that is wrong
// for even an hour is not a display bug, it is a permanent discount or
// a permanent overcharge on every seat sold in that window.
//
// What's under test: the $13 -> $18 step that fires when the charter cap
// fills, the tiers that must NOT move with it (founder, granted seats),
// the yearly-is-exactly-10x invariant the "two months on the house" line
// depends on, and the defensive default (an unspecified charter
// eligibility must quote the HIGHER floor, never the lower one).
//
// Pure functions only: no Redis, no Stripe, no network, no env needed.
//
// Run:  npm run test:pricing
// Exit: 0 if every assertion passes, 1 otherwise.

import {
  CHARTER_MONTHLY_FLOOR_CENTS,
  CHARTER_YEARLY_FLOOR_CENTS,
  FOUNDER_MONTHLY_FLOOR_CENTS,
  GRANTED_SEAT_MONTHLY_FLOOR_CENTS,
  STANDARD_MONTHLY_FLOOR_CENTS,
  STANDARD_YEARLY_FLOOR_CENTS,
  floorCentsFor,
  floorLabel,
  standardFloorCents,
} from "../src/lib/pricing";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${
      ok ? "" : `  (got ${String(actual)}, wanted ${String(expected)})`
    }`
  );
}

console.log("\n--- the raise: charter open vs charter full ---");
check(
  "monthly, charter open",
  standardFloorCents("monthly", true),
  CHARTER_MONTHLY_FLOOR_CENTS
);
check(
  "monthly, charter full",
  standardFloorCents("monthly", false),
  STANDARD_MONTHLY_FLOOR_CENTS
);
check("the step is $13 -> $18", `${CHARTER_MONTHLY_FLOOR_CENTS}->${STANDARD_MONTHLY_FLOOR_CENTS}`, "1300->1800");
check(
  "yearly, charter open",
  standardFloorCents("yearly", true),
  CHARTER_YEARLY_FLOOR_CENTS
);
check(
  "yearly, charter full",
  standardFloorCents("yearly", false),
  STANDARD_YEARLY_FLOOR_CENTS
);

console.log("\n--- yearly is exactly 10x monthly (the 'two months' line) ---");
check(
  "charter yearly = 10x charter monthly",
  CHARTER_YEARLY_FLOOR_CENTS,
  CHARTER_MONTHLY_FLOOR_CENTS * 10
);
check(
  "standard yearly = 10x standard monthly",
  STANDARD_YEARLY_FLOOR_CENTS,
  STANDARD_MONTHLY_FLOOR_CENTS * 10
);

console.log("\n--- tiers the raise must NOT move ---");
check(
  "founder floor survives the raise",
  floorCentsFor("monthly", true, false, false),
  FOUNDER_MONTHLY_FLOOR_CENTS
);
check(
  "founder floor ignores charter state",
  floorCentsFor("monthly", true, false, true),
  FOUNDER_MONTHLY_FLOOR_CENTS
);
check(
  "granted seat converts at the HELD rate, not the new floor",
  floorCentsFor("monthly", false, true, false),
  GRANTED_SEAT_MONTHLY_FLOOR_CENTS
);
check(
  "granted seat held rate is still $13 after the raise",
  GRANTED_SEAT_MONTHLY_FLOOR_CENTS,
  1300
);

console.log("\n--- the defensive default ---");
// A caller that forgets to pass charter eligibility must quote the
// HIGHER floor. Too high gets corrected at checkout; too low sells a
// lifetime lock at a price we never meant to offer.
check(
  "omitted charter eligibility quotes the standard floor",
  floorCentsFor("monthly", false),
  STANDARD_MONTHLY_FLOOR_CENTS
);

console.log("\n--- labels used in copy ---");
check("charter label", floorLabel(CHARTER_MONTHLY_FLOOR_CENTS), "$13");
check("standard label", floorLabel(STANDARD_MONTHLY_FLOOR_CENTS), "$18");
check("standard yearly label", floorLabel(STANDARD_YEARLY_FLOOR_CENTS), "$180");
check("non-round amount keeps cents", floorLabel(1350), "$13.50");

console.log(
  failures === 0
    ? "\nAll pricing assertions passed.\n"
    : `\n${failures} assertion(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
