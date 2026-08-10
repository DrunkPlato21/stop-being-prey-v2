// Dev-only test for the watch + notification contract, the pieces of
// "watch a thread" whose whole job is to NOT fire (or fire once). Run:
//
//   npm run test:guild-watch
//
// Writes only into the dev: keyspace (GUILD_KEY_PREFIX is forced below,
// before the guild module is loaded), so it never touches live threads.

process.env.GUILD_KEY_PREFIX = "dev:";
process.env.NOTIFICATIONS_KEY_PREFIX = "dev:";
process.env.NODE_ENV = "development";

import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  // Don't let .env.local's own *_KEY_PREFIX values (empty = production
  // keyspace) win. That's the whole safety of this file.
  if (
    m &&
    m[1] !== "GUILD_KEY_PREFIX" &&
    m[1] !== "NOTIFICATIONS_KEY_PREFIX" &&
    !process.env[m[1]]
  ) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const {
  autoWatchThread,
  claimReplyEmailCooldown,
  getWatchState,
  listWatchStates,
  listWatchers,
  setWatchState,
} = await import("../src/lib/guild.ts");
const { upsertCollapsed, listForMember, markRead, unreadCount } =
  await import("../src/lib/notifications.ts");

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

// --- the collapse contract -------------------------------------------
// One live alert per (member, thread): replies fold into a single unread
// row instead of stacking identical rows. Reading it resets the fold.
const carol = `carol-${Date.now()}@example.com`;
const KEY = `guild-thread:${THREAD}`;
const fold = (actorName: string, linkUrl: string) =>
  upsertCollapsed({
    memberEmail: carol,
    type: "guild_reply",
    collapseKey: KEY,
    actorName,
    formatTitle: (actors, count) =>
      `${actors.join(" and ")} replied${
        count > actors.length ? ` (${count} new)` : ""
      }`,
    body: "Thread title",
    linkUrl,
  });

const first = await fold("Alice", `/guild/${THREAD}#reply-1`);
check("the first reply creates the row", first?.title, "Alice replied");

const second = await fold("Bob", `/guild/${THREAD}#reply-2`);
check("the second folds into the SAME row", second?.id, first?.id);
check("and the title carries both names", second?.title, "Alice and Bob replied");
check(
  "the link still points at the first unseen reply",
  second?.linkUrl,
  `/guild/${THREAD}#reply-1`
);

const third = await fold("Alice", `/guild/${THREAD}#reply-3`);
check(
  "a repeat replier counts without repeating her name",
  third?.title,
  "Alice and Bob replied (3 new)"
);

check("three replies, ONE unread row on the badge", await unreadCount(carol), 1);
check(
  "and one row in the panel",
  (await listForMember(carol)).filter((n) => !n.read).length,
  1
);

// Carol opens the panel; the row is read. The conversation moves on.
if (first) await markRead(carol, [first.id]);
const fourth = await fold("Bob", `/guild/${THREAD}#reply-4`);
check(
  "after she's seen it, the next reply starts a FRESH row",
  fourth !== null && fourth.id !== first?.id,
  true
);
check("with a fresh title", fourth?.title, "Bob replied");
check(
  "pointing at the first reply she hasn't seen",
  fourth?.linkUrl,
  `/guild/${THREAD}#reply-4`
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
