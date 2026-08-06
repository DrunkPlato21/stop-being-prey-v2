// Dev-only test for the watcher-notification contract, the one piece of
// "watch a thread" whose whole job is to NOT fire. Run:
//
//   npm run test:guild-watch
//
// Writes only into the dev: keyspace (GUILD_KEY_PREFIX is forced below,
// before the guild module is loaded), so it never touches live threads.

process.env.GUILD_KEY_PREFIX = "dev:";
process.env.NODE_ENV = "development";

import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  // Don't let .env.local's own GUILD_KEY_PREFIX (empty = production
  // keyspace) win. That's the whole safety of this file.
  if (m && m[1] !== "GUILD_KEY_PREFIX" && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const {
  autoWatchThread,
  claimReplyEmailCooldown,
  claimWatcherNotifications,
  getWatchState,
  listWatchStates,
  listWatchers,
  markThreadRead,
  setWatchState,
} = await import("../src/lib/guild.ts");

const THREAD = `watch-test-${Date.now()}`;
const alice = "alice@example.com";
const bob = "bob@example.com";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        expected ${e}\n        got      ${a}`}`);
}

console.log(`\nguild watch contract (thread ${THREAD})\n`);

// --- joining ---------------------------------------------------------
await autoWatchThread(THREAD, alice);
check(
  "posting joins you IN-APP ONLY, never to email",
  await getWatchState(THREAD, alice),
  "auto"
);

await setWatchState(THREAD, alice, false);
check("you can mute", await getWatchState(THREAD, alice), "off");

await autoWatchThread(THREAD, alice);
check(
  "replying again does NOT override a deliberate mute",
  await getWatchState(THREAD, alice),
  "off"
);

await setWatchState(THREAD, alice, true);
check(
  "clicking the bell is what opts you into email",
  await getWatchState(THREAD, alice),
  "on"
);

await autoWatchThread(THREAD, alice);
check(
  "replying later does NOT downgrade a deliberate opt-in",
  await getWatchState(THREAD, alice),
  "on"
);

await autoWatchThread(THREAD, bob);
check("both get in-app notices", (await listWatchers(THREAD)).sort(), [
  alice,
  bob,
]);

const states = await listWatchStates(THREAD);
check(
  "but only the bell-clicker is email-eligible",
  Object.entries(states).filter(([, s]) => s === "on").map(([e]) => e),
  [alice]
);

await setWatchState(THREAD, bob, false);
check("a muted member drops off entirely", await listWatchers(THREAD), [alice]);
await setWatchState(THREAD, bob, true);

// --- the suppression contract ----------------------------------------
const t1 = Date.now();
check(
  "first reply notifies everyone watching",
  (await claimWatcherNotifications(THREAD, [alice, bob], t1)).sort(),
  [alice, bob]
);

check(
  "a second reply does NOT notify again while the ping is unread",
  await claimWatcherNotifications(THREAD, [alice, bob], t1 + 1000),
  []
);

check(
  "and not on the third either",
  await claimWatcherNotifications(THREAD, [alice, bob], t1 + 2000),
  []
);

// Alice goes and reads the thread. Bob doesn't.
await markThreadRead(THREAD, alice, t1 + 3000);

check(
  "once she's been back, the next reply rings again — for her only",
  await claimWatcherNotifications(THREAD, [alice, bob], t1 + 4000),
  [alice]
);

check(
  "and she's quiet again until her next visit",
  await claimWatcherNotifications(THREAD, [alice, bob], t1 + 5000),
  []
);

// --- email volume ----------------------------------------------------
// Watchers send on the same per-(member, thread) cooldown as the direct
// recipient, so a burst of replies can't become a burst of email.
check(
  "a watcher's first email claims the thread cooldown",
  await claimReplyEmailCooldown(bob, THREAD, 60),
  true
);
check(
  "a second reply in the window sends no second email",
  await claimReplyEmailCooldown(bob, THREAD, 60),
  false
);
check(
  "the cooldown is per thread, not per member",
  await claimReplyEmailCooldown(bob, `${THREAD}-other`, 60),
  true
);

console.log(
  `\n${failures === 0 ? "all good" : `${failures} FAILED`}\n`
);
process.exit(failures === 0 ? 0 : 1);
