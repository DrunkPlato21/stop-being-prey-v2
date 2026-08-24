// Regression test for the Arena's record-keeping (lib/arena.ts).
//
// What's under test is everything that can quietly corrupt the archive
// while Clay is mid-fight and not looking:
//
//   - editing a tile keeps its place in the bout (order IS the meaning)
//   - a move pulled off a tile leaves the Arsenal's record, but ONLY if
//     no other tile in the bout still carries it
//   - deleting a tile recomputes the bout's counters from the record,
//     so the LIVE window never reads a timestamp for a tile that's gone
//   - a case number can never be worn by two cases, and a re-seal keeps
//     the number the bout already holds
//   - slugs are minted once, are unique, and resolve back to their bout
//
// Safe to run against the shared dev Redis: it forces its OWN isolated
// key namespace (`arenatest:`), touches no other keyspace, sends no
// email and rings no bell. Wipes its keys before and after.
//
// Run:  npm run test:arena
// Exit: 0 if every assertion passes, 1 otherwise.

import { readFileSync } from "node:fs";
import { Redis } from "@upstash/redis";

// Load .env.local BEFORE importing arena.ts (it reads its key prefix
// and Redis creds from env at module load). Force an isolated keyspace.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const TEST_PREFIX = "arenatest:";
process.env.ARENA_KEY_PREFIX = TEST_PREFIX;

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

const {
  addTile,
  boutHref,
  createBout,
  deleteBout,
  deleteTile,
  getBout,
  getBoutByParam,
  getBoutSource,
  getBoutVersion,
  listBouts,
  listBoutsForMove,
  listTiles,
  sealBout,
  setBoutSource,
  updateBoutStamp,
  updateTile,
} = await import("../src/lib/arena.ts");

// Two real Arsenal slugs, so the move index is exercised exactly the
// way a tagged tile exercises it.
const MOVE_A = "concede-the-defensible-isolate-the-indefensible";
const MOVE_B = "decency-disclaimer";

await wipe();

console.log("\nEDIT: a fix keeps the tile's place, and re-tags the Arsenal");
{
  const bout = await createBout("The Numbers Guy");
  if (!bout) throw new Error("no Redis");
  const first = await addTile(bout.id, {
    type: "specimen",
    body: "Their post.",
    moves: [MOVE_A],
  });
  const second = await addTile(bout.id, {
    type: "read",
    body: "Waht it is.",
    moves: [MOVE_A, MOVE_B],
  });
  if (!first || !second) throw new Error("tiles did not post");

  const edited = await updateTile(second.id, {
    type: "read",
    body: "What it is.",
    // MOVE_B dropped; MOVE_A stays on this tile AND on the first one.
    moves: [MOVE_A],
  });
  check("edit rewrites the body", edited?.body === "What it is.");
  check("edit keeps the tile id", edited?.id === second.id);
  check(
    "edit keeps createdAt (the order never shifts)",
    edited?.createdAt === second.createdAt
  );
  const order = await listTiles(bout.id);
  check(
    "the bout still reads in the order it was fought",
    order.map((t) => t.id).join() === [first.id, second.id].join()
  );
  check(
    "a dropped tag leaves the move's record",
    !(await listBoutsForMove(MOVE_B)).some((b) => b.id === bout.id)
  );
  check(
    "a tag another tile still carries stays on the record",
    (await listBoutsForMove(MOVE_A)).some((b) => b.id === bout.id)
  );

  // The chip aggregate (bout.moves) has to follow every edit: it is
  // what dresses the case plate on the index.
  check(
    "the bout's chip aggregate drops the removed tag",
    !(await getBout(bout.id))?.moves.includes(MOVE_B)
  );

  await updateTile(second.id, {
    type: "read",
    body: "What it is.",
    moves: [MOVE_A, MOVE_B],
  });
  check(
    "re-tagging puts the bout back on the move's wall",
    (await listBoutsForMove(MOVE_B)).some((b) => b.id === bout.id)
  );
  const retagged = await getBout(bout.id);
  check(
    "the chip aggregate carries every tag on the record",
    Boolean(retagged?.moves.includes(MOVE_A) && retagged?.moves.includes(MOVE_B))
  );
}

console.log("\nDELETE: counters come from the record, not a decrement");
{
  const bout = await createBout("The Credential Flash");
  if (!bout) throw new Error("no Redis");
  const first = await addTile(bout.id, {
    type: "specimen",
    body: "Their post.",
    moves: [MOVE_B],
  });
  const second = await addTile(bout.id, {
    type: "counter",
    body: "Typo tile, posted twice.",
    moves: [MOVE_B],
  });
  if (!first || !second) throw new Error("tiles did not post");

  const gone = await deleteTile(second.id);
  check("delete returns the tile it removed", gone?.id === second.id);
  const after = await getBout(bout.id);
  check("the tile is out of the bout", (await listTiles(bout.id)).length === 1);
  check("tileCount matches the record", after?.tileCount === 1);
  check(
    "lastTileAt falls back to the newest surviving tile",
    after?.lastTileAt === first.createdAt
  );
  check(
    "the move keeps the bout (the first tile still carries it)",
    (await listBoutsForMove(MOVE_B)).some((b) => b.id === bout.id)
  );

  await deleteTile(first.id);
  const empty = await getBout(bout.id);
  check("an emptied bout counts zero", empty?.tileCount === 0);
  check(
    "an emptied bout falls back to its own createdAt",
    empty?.lastTileAt === empty?.createdAt
  );
  check(
    "the last tag out drops the bout from the move",
    !(await listBoutsForMove(MOVE_B)).some((b) => b.id === bout.id)
  );
  check(
    "an emptied bout's chip aggregate is empty too",
    empty?.moves.length === 0
  );
  check(
    "the bout survives losing every tile",
    (await listBouts()).some((b) => b.id === bout.id)
  );
}

console.log("\nSEAL: the case number is claimed, never just typed");
{
  const one = await createBout("Grief as a Cudgel");
  const two = await createBout("The Moralizer Returns");
  if (!one || !two) throw new Error("no Redis");
  await addTile(one.id, { type: "verdict", body: "Filed." });
  await addTile(two.id, { type: "verdict", body: "Filed." });

  const sealedOne = await sealBout(one.id, {
    caseNo: 11,
    archetype: "The Moralizer",
  });
  check(
    "the number Clay typed is the number it wears",
    sealedOne?.bout.caseNo === 11
  );
  check(
    "no renumbering when the stamp was free",
    sealedOne?.renumberedFrom === null
  );

  const sealedTwo = await sealBout(two.id, { caseNo: 11 });
  check("a taken number is refused", sealedTwo?.bout.caseNo !== 11);
  check(
    "the seal reports the number it moved off",
    sealedTwo?.renumberedFrom === 11
  );
  check(
    "the replacement is past the highest on file",
    sealedTwo?.bout.caseNo === 12
  );

  const reseal = await sealBout(one.id, { caseNo: null });
  check("a re-seal keeps the bout's own number", reseal?.bout.caseNo === 11);
  const again = await sealBout(one.id, { caseNo: 11 });
  check(
    "a re-seal may ask for the number it already holds",
    again?.bout.caseNo === 11 && again?.renumberedFrom === null
  );
}

console.log("\nSLUG: one readable address per case, minted once");
{
  const first = await createBout("The Sniper Who Cried Bias");
  const twin = await createBout("The Sniper Who Cried Bias");
  if (!first || !twin) throw new Error("no Redis");
  await addTile(first.id, { type: "verdict", body: "Filed." });
  await addTile(twin.id, { type: "verdict", body: "Filed." });

  const a = await sealBout(first.id, { caseNo: null });
  const b = await sealBout(twin.id, { caseNo: null });
  check(
    "the slug reads as words",
    a?.bout.slug === "the-sniper-who-cried-bias",
    String(a?.bout.slug)
  );
  check(
    "two fights with one title don't collide",
    b?.bout.slug === "the-sniper-who-cried-bias-2",
    String(b?.bout.slug)
  );
  check(
    "the link uses the slug",
    boutHref(a!.bout) === "/arena/the-sniper-who-cried-bias"
  );
  check(
    "the slug resolves back to its bout",
    (await getBoutByParam("the-sniper-who-cried-bias"))?.id === first.id
  );
  check(
    "the raw id still resolves (old links keep working)",
    (await getBoutByParam(first.id))?.id === first.id
  );
  check(
    "an unknown slug resolves to nothing",
    (await getBoutByParam("no-such-fight")) === null
  );

  const resealed = await sealBout(first.id, { caseNo: null });
  check(
    "a re-seal keeps the address it already published",
    resealed?.bout.slug === a?.bout.slug
  );
}

console.log("\nVERSION: the number a watching room polls moves on every change");
{
  const bout = await createBout("Live Refresh");
  if (!bout) throw new Error("no Redis");
  const start = await getBoutVersion(bout.id);
  const tile = await addTile(bout.id, { type: "specimen", body: "Their post." });
  const afterPost = await getBoutVersion(bout.id);
  check("posting a tile moves it", (afterPost ?? 0) > (start ?? 0));

  await updateTile(tile!.id, { type: "specimen", body: "Their post, fixed." });
  const afterEdit = await getBoutVersion(bout.id);
  check(
    "a fix moves it too (no counter changed, but the room did)",
    (afterEdit ?? 0) > (afterPost ?? 0)
  );

  await deleteTile(tile!.id);
  const afterDelete = await getBoutVersion(bout.id);
  check("a delete moves it", (afterDelete ?? 0) > (afterEdit ?? 0));

  await addTile(bout.id, { type: "verdict", body: "Filed." });
  const sealed = await sealBout(bout.id, { caseNo: null });
  check("sealing moves it", (sealed?.bout.updatedAt ?? 0) > (afterDelete ?? 0));
  check(
    "an unknown bout has no version",
    (await getBoutVersion("no-such-bout")) === null
  );
}

console.log("\nBIN: deleting a case takes everything with it");
{
  const bout = await createBout("The Import That Missed");
  if (!bout) throw new Error("no Redis");
  await addTile(bout.id, {
    type: "specimen",
    body: "Their post.",
    moves: [MOVE_A],
  });
  const sealed = await sealBout(bout.id, { caseNo: 41 });
  const firstSlug = sealed!.bout.slug!;

  const renamed = await updateBoutStamp(bout.id, {
    title: "Renamed Before Binning",
  });
  check(
    "a rename mints a new link",
    renamed?.bout.slug === "renamed-before-binning",
    String(renamed?.bout.slug)
  );
  check(
    "the old link still resolves (it may already be in an inbox)",
    (await getBoutByParam(firstSlug))?.id === bout.id
  );

  const taken = await updateBoutStamp(bout.id, { caseNo: 11 });
  check(
    "a number another case holds is refused, not stolen",
    taken?.bout.caseNo === 41 && taken?.renumberedFrom === 11
  );

  const binned = await deleteBout(bout.id);
  check("delete reports the images it freed", Array.isArray(binned?.imageUrls));
  check("the bout is gone", (await getBout(bout.id)) === null);
  check("its tiles are gone", (await listTiles(bout.id)).length === 0);
  check("it has no version left", (await getBoutVersion(bout.id)) === null);
  check("its first link is gone", (await getBoutByParam(firstSlug)) === null);
  check(
    "its renamed link is gone too",
    (await getBoutByParam("renamed-before-binning")) === null
  );
  check(
    "it is off the move's wall",
    !(await listBoutsForMove(MOVE_A)).some((b) => b.id === bout.id)
  );
  check(
    "it is out of the index",
    !(await listBouts()).some((b) => b.id === bout.id)
  );

  const reuse = await createBout("Taking 041");
  await addTile(reuse!.id, { type: "verdict", body: "Filed." });
  const reused = await sealBout(reuse!.id, { caseNo: 41 });
  check("its case number went back in the pool", reused?.bout.caseNo === 41);
}

console.log("\nSOURCE: the private note holds, and never rides the bout");
{
  const bout = (await createBout("Where it came from"))!;

  check("a fresh bout has no source", (await getBoutSource(bout.id)) === null);

  const saved = await setBoutSource(bout.id, {
    url: "https://x.com/someone/status/123",
  });
  check(
    "a pasted link is kept",
    saved?.url === "https://x.com/someone/status/123"
  );
  check("it is stamped when caught", typeof saved?.capturedAt === "number");
  check("the archive slot starts empty", saved?.archiveUrl === null);

  // The whole point of the timestamp: it answers "was the original still
  // live when I filed this?", so a later edit must not restate it.
  const caughtAt = saved!.capturedAt;
  await new Promise((r) => setTimeout(r, 5));
  const archived = await setBoutSource(bout.id, {
    url: "https://x.com/someone/status/123",
    archiveUrl: "https://archive.ph/abcd",
  });
  check(
    "adding an archive copy keeps it",
    archived?.archiveUrl === "https://archive.ph/abcd"
  );
  check("and does not restamp the capture", archived?.capturedAt === caughtAt);

  const moved = await setBoutSource(bout.id, {
    url: "https://x.com/someone/status/999",
  });
  check("a genuinely new link restamps", (moved?.capturedAt ?? 0) > caughtAt);

  // The value is rendered as an anchor on the bench, so a scheme that
  // isn't http(s) has to read as "nothing saved", not as a live link.
  await setBoutSource(bout.id, { url: "javascript:alert(1)" });
  check("a hostile scheme is refused", (await getBoutSource(bout.id)) === null);

  await setBoutSource(bout.id, { url: "https://example.com/post" });
  await setBoutSource(bout.id, { url: "   " });
  check("an empty paste clears the note", (await getBoutSource(bout.id)) === null);

  // The reason it lives outside the record at all: the bout object is
  // what member-facing surfaces and the Sunday digest read.
  await setBoutSource(bout.id, { url: "https://example.com/post" });
  const record = await getBout(bout.id);
  check(
    "the bout record carries no trace of it",
    !JSON.stringify(record).includes("example.com")
  );

  await deleteBout(bout.id);
  check(
    "binning the bout takes the note with it",
    (await getBoutSource(bout.id)) === null
  );
}

await wipe();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
