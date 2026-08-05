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
  claimWatcherNotifications,
  getWatchState,
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
check("posting joins you", await getWatchState(THREAD, alice), "watching");

await setWatchState(THREAD, alice, false);
check("you can mute", await getWatchState(THREAD, alice), "muted");

await autoWatchThread(THREAD, alice);
check(
  "replying again does NOT override a deliberate mute",
  await getWatchState(THREAD, alice),
  "muted"
);

await setWatchState(THREAD, alice, true);
await autoWatchThread(THREAD, bob);
check("watcher list has both", (await listWatchers(THREAD)).sort(), [
  alice,
  bob,
]);

await setWatchState(THREAD, bob, false);
check("a muted member drops off the list", await listWatchers(THREAD), [alice]);
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

console.log(
  `\n${failures === 0 ? "all good" : `${failures} FAILED`}\n`
);
process.exit(failures === 0 ? 0 : 1);
