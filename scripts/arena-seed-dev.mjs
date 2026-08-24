// Dev-only: seed the Arena's dev keyspace with dummy bouts so the
// format can be judged with furniture in the room. Two open bouts in
// different stages, three sealed case files, tagged with REAL Arsenal
// slugs so the armory wall fills, plus dummy reactions and whispers.
// All fight content is invented placeholder.
//
//   node scripts/arena-seed-dev.mjs
//
// Writes ONLY the dev: arena keyspace the live site never reads.
// Refuses to run against an unprefixed keyspace.

import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const env = {};
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const PREFIX = process.env.ARENA_KEY_PREFIX ?? "dev:";
if (PREFIX === "" || process.env.NODE_ENV === "production") {
  console.error("REFUSING: this seeds the dev keyspace only.");
  process.exit(1);
}

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing Upstash env.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const now = Date.now();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------
// The furniture. Handles and fights are invented. Moves are REAL
// Arsenal slugs so the wall debuts believably.
// ---------------------------------------------------------------------

const BOUTS = [
  {
    id: "seed-open-quote-surgeon",
    title: "The Quote Surgeon",
    status: "open",
    createdAt: now - 5 * HOUR,
    tiles: [
      {
        type: "specimen",
        handle: "@FactsOverFeel_88",
        body: 'So now he’s admitting "most gun owners are responsible." Interesting walkback from the guy who built a brand calling everyone predators.',
        transcript:
          "[11:04 AM] @FactsOverFeel_88: So now he’s admitting “most gun owners are responsible.” Interesting walkback from the guy who built a brand calling everyone predators.",
        moves: ["quote-weaponization"],
        at: now - 5 * HOUR,
        reactions: { fire: 3, wow: 1 },
      },
      {
        type: "read",
        body: "He cut nine words out of a paragraph and mounted them like a trophy. The sentence he skipped is the one that says the opposite. This is quote surgery: the excision is the argument, and he is betting nobody checks the patient.",
        moves: [],
        at: now - 4 * HOUR,
        reactions: { hundred: 2, fire: 1 },
        whispers: [
          {
            email: "member-dummy-1@example.com",
            body: "Post the full paragraph side by side. The cut IS the confession.",
          },
        ],
      },
    ],
  },
  {
    id: "seed-open-sunday-sniper",
    title: "Fresh on the Slab: Sunday Sniper",
    status: "open",
    createdAt: now - 40 * 60_000,
    tiles: [
      {
        type: "specimen",
        handle: "@quietobserver_x",
        body: "Not reading all that. The fact you needed 2000 words tells me everything lol.",
        transcript:
          "[8:12 AM] @quietobserver_x: Not reading all that. The fact you needed 2000 words tells me everything lol.",
        moves: [],
        at: now - 40 * 60_000,
        reactions: { laugh: 2 },
      },
    ],
  },
  {
    id: "seed-case-credential-flash",
    title: "The Credential Flash",
    status: "sealed",
    createdAt: now - 9 * DAY,
    sealedAt: now - 8 * DAY,
    caseNo: 8,
    archetype: "The Expert",
    rulesApplied: "1, 5",
    tiles: [
      {
        type: "specimen",
        handle: "@DrM_Economics",
        body: "As someone with an actual PhD in this field: no. Just no. I don’t have the crayons to explain how wrong this is.",
        transcript:
          "[9:41 PM] @DrM_Economics: As someone with an actual PhD in this field: no. Just no. I don’t have the crayons to explain how wrong this is.",
        moves: ["argument-from-ignorance"],
        at: now - 9 * DAY,
        reactions: { wow: 4, fire: 2 },
      },
      {
        type: "read",
        body: "The credential is doing all the work because nothing else showed up. No claim, no number, no quoted line. When a man leads with his diploma and follows with an insult, the middle is missing because he does not have one.",
        moves: [],
        at: now - 9 * DAY + HOUR,
        reactions: { hundred: 5 },
      },
      {
        type: "counter",
        body: "Then it should take you one sentence. **Name the error. Quote the line.** Credentials answer questions; they don’t *replace* them.",
        moves: ["the-reversal-receipt"],
        at: now - 9 * DAY + 2 * HOUR,
        reactions: { fire: 7, hundred: 3 },
        whispers: [
          {
            email: "member-dummy-2@example.com",
            body: "The crayons line was the tell. Confidence doesn’t reach for props.",
          },
        ],
      },
      {
        type: "result",
        body: "Eleven hours later: “I don’t owe you free labor.” Then the account went quiet. The audience watched a PhD decline a one-sentence assignment.",
        moves: [],
        at: now - 9 * DAY + 13 * HOUR,
        reactions: { laugh: 6, fire: 2 },
      },
      {
        type: "verdict",
        body: "The credential flash works only while the task stays abstract. Hand him one small, checkable job and the diploma has to either do the work or leave the field. They almost always leave.",
        moves: [],
        at: now - 8 * DAY,
        reactions: { hundred: 8, fire: 3 },
      },
    ],
  },
  {
    id: "seed-case-grief-cudgel",
    title: "Grief as a Cudgel",
    status: "sealed",
    createdAt: now - 6 * DAY,
    sealedAt: now - 5 * DAY,
    caseNo: 9,
    archetype: "The Moralizer",
    rulesApplied: "3",
    tiles: [
      {
        type: "specimen",
        handle: "@heart_first_always",
        body: "With respect, a man DIED. Maybe today isn’t the day for your little media critique thread. Have some decency.",
        transcript:
          "[2:20 PM] @heart_first_always: With respect, a man DIED. Maybe today isn’t the day for your little media critique thread. Have some decency.",
        moves: ["decency-disclaimer", "asymmetric-demand"],
        at: now - 6 * DAY,
        reactions: { wow: 3 },
      },
      {
        type: "read",
        body: "Notice who gets the decency lecture. Not the outlets that ran the false story. Only the man correcting it. When the demand lands on one side of the exchange, the demand is the argument.",
        moves: [],
        at: now - 6 * DAY + HOUR,
        reactions: { hundred: 4, fire: 2 },
      },
      {
        type: "counter",
        body: "You’re not asking them to retract the story. You’re asking me to stop correcting it. Sit with why those are different.",
        moves: ["concede-the-defensible-isolate-the-indefensible"],
        at: now - 6 * DAY + 2 * HOUR,
        reactions: { fire: 5, hundred: 2, love: 1 },
      },
      {
        type: "verdict",
        body: "Grief is real, and the moralizer knows it, which is why she borrows it. Name the asymmetry once, gently, and the costume comes off on its own.",
        moves: [],
        at: now - 5 * DAY,
        reactions: { hundred: 6 },
      },
    ],
  },
  {
    id: "seed-case-numbers-guy",
    title: "The Numbers Guy",
    status: "sealed",
    createdAt: now - 3 * DAY,
    sealedAt: now - 2 * DAY,
    caseNo: 10,
    archetype: "The Statistician",
    rulesApplied: "2, 7",
    tiles: [
      {
        type: "specimen",
        handle: "@RawDataOnly",
        body: "Per capita, you are literally more likely to be killed by a vending machine. But sure, keep the panic content coming, it’s good for engagement.",
        transcript:
          "[6:55 PM] @RawDataOnly: Per capita, you are literally more likely to be killed by a vending machine. But sure, keep the panic content coming, it’s good for engagement.",
        moves: ["category-collapse"],
        at: now - 3 * DAY,
        reactions: { laugh: 2, wow: 1 },
      },
      {
        type: "read",
        body: "The vending machine number aggregates every person in the country. The risk I wrote about concentrates in one neighborhood, one age band, one hour of the night. Collapsing those categories is how you make a real danger disappear into an average.",
        moves: [],
        at: now - 3 * DAY + HOUR,
        reactions: { hundred: 3 },
      },
      {
        type: "counter",
        body: "Walk it to the concrete case. Tell the mother on that block she’s statistically a vending machine victim. Averages don’t live anywhere. People do.",
        moves: ["walk-to-the-concrete-third-party"],
        at: now - 3 * DAY + 2 * HOUR,
        reactions: { fire: 4, hundred: 2 },
      },
      {
        type: "result",
        body: "He reposted a chart with no axis labels and muted the thread. The chart got nine likes. The correction got ninety.",
        moves: [],
        at: now - 3 * DAY + 6 * HOUR,
        reactions: { laugh: 5 },
      },
      {
        type: "verdict",
        body: "A collapsed category is a magic trick: the danger goes into the hat and an average comes out. Name the categories and make him defend the equivalence out loud. The trick doesn’t survive narration.",
        moves: [],
        at: now - 2 * DAY,
        reactions: { hundred: 7, fire: 2 },
      },
    ],
  },
];

// ---------------------------------------------------------------------

const k = (s) => `${PREFIX}${s}`;
// Same rule as slugify() in lib/arena.ts. Kept in step by hand: this is
// furniture for dev, not the source of truth for a real seal.
const slugify = (title) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

let tileCounter = 0;

for (const bout of BOUTS) {
  const tiles = bout.tiles;
  const lastTileAt = tiles[tiles.length - 1].at;
  const record = {
    id: bout.id,
    title: bout.title,
    status: bout.status,
    createdAt: bout.createdAt,
    sealedAt: bout.sealedAt ?? null,
    lastTileAt,
    tileCount: tiles.length,
    caseNo: bout.caseNo ?? null,
    archetype: bout.archetype ?? null,
    rulesApplied: bout.rulesApplied ?? null,
    // Sealed seeds carry the readable slug a real seal would have
    // minted, so dev exercises the same URLs (and the same slug
    // register) production will use.
    slug: bout.status === "sealed" ? slugify(bout.title) : null,
    // The chip aggregate the tile writes maintain in production.
    moves: [...new Set(tiles.flatMap((t) => t.moves ?? []))],
  };
  await redis.set(k(`arena:bout:${bout.id}`), JSON.stringify(record));
  await redis.zadd(k("arena:bouts"), { score: lastTileAt, member: bout.id });
  if (record.slug) await redis.set(k(`arena:slug:${record.slug}`), bout.id);
  // The case-number register: seeded so a dev seal picks the next free
  // number instead of colliding with the furniture.
  if (record.caseNo != null) {
    await redis.hset(k("arena:casenos"), { [String(record.caseNo)]: bout.id });
  }

  for (const t of tiles) {
    const tileId = `seed-tile-${bout.id}-${tileCounter++}`;
    const tile = {
      id: tileId,
      boutId: bout.id,
      type: t.type,
      body: t.body,
      handle: t.handle ?? null,
      transcript: t.transcript ?? null,
      moves: t.moves ?? [],
      imageUrl: null,
      createdAt: t.at,
    };
    await redis.set(k(`arena:tile:${tileId}`), JSON.stringify(tile));
    await redis.zadd(k(`arena:bout:${bout.id}:tiles`), {
      score: t.at,
      member: tileId,
    });
    // Reactions: hash of fake member emails -> key.
    if (t.reactions) {
      const hash = {};
      let n = 0;
      for (const [key, count] of Object.entries(t.reactions)) {
        for (let i = 0; i < count; i++) {
          hash[`seed-member-${n++}@example.com`] = key;
        }
      }
      await redis.hset(k(`arena:tile:${tileId}:reactedby`), hash);
    }
    for (const w of t.whispers ?? []) {
      await redis.rpush(
        k(`arena:tile:${tileId}:whispers`),
        JSON.stringify({ email: w.email, body: w.body, createdAt: t.at + 20 * 60_000 })
      );
    }
    // Arsenal accretion + debut register, same writes addTile does.
    for (const slug of t.moves ?? []) {
      await redis.zadd(k(`arena:move:${slug}:bouts`), {
        score: t.at,
        member: bout.id,
      });
      await redis.zadd(
        k("arena:arsenal:debuts"),
        { nx: true },
        { score: t.at, member: slug }
      );
    }
  }
  console.log(`seeded ${bout.status.padEnd(6)} ${bout.id} (${tiles.length} tiles)`);
}

console.log("done. dev keyspace only; delete anytime with seed- id patterns.");
