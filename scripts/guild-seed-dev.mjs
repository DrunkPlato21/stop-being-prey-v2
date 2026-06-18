import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

// Dev-only: seed the Guild with a pinned Question of the Week, a founding
// member thread, and a couple of nested replies so the room reads alive
// on arrival while building/testing locally.
//
// Usage:  npm run guild:seed-dev   (run guild:reset-dev first for a clean slate)
//
// This writes ONLY into the dev: keyspace. The real launch seed (Clay's
// actual Question of the Week + the founding thread) is posted live by
// Clay himself on production — see the v1 brief. Author display names
// here resolve from the (unprefixed) profile store, so fake seed authors
// show as "A member"; that's expected for a dev fixture.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.env.NODE_ENV === "production") {
  console.error("REFUSING: NODE_ENV=production. Seed only writes the dev: keyspace.");
  process.exit(1);
}

const envPath = join(__dirname, "..", ".env.local");
let env = {};
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  // fall through to process.env
}

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (.env.local).");
  process.exit(1);
}

const redis = new Redis({ url, token });

const P = "dev:";
const THREADS_INDEX = `${P}guild:threads`;
const THREAD = (id) => `${P}guild:thread:${id}`;
const REPLIES_INDEX = (tid) => `${P}guild:thread:${tid}:replies`;
const REPLY = (id) => `${P}guild:reply:${id}`;
const PINNED = `${P}guild:pinned`;
// Member records live in the (dev-prefixed) members keyspace; seeding a
// couple lets the founder/charter/tier chips actually render in the
// Guild. Names still show "A member" because profiles are read from the
// unprefixed (prod) keyspace, which we never write.
const MEMBER = (email) => `${P}member:${email}`;

const admin = (env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || "clay@stopbeingprey.com")
  .toLowerCase()
  .trim();

const now = Date.now();
const h = (n) => now - n * 60 * 60 * 1000;

function mkThread(o) {
  return {
    id: randomUUID(),
    authorEmail: o.authorEmail,
    title: o.title,
    body: o.body,
    category: o.category ?? "open",
    createdAt: o.createdAt,
    editedAt: null,
    lastActivityAt: o.lastActivityAt ?? o.createdAt,
    replyCount: o.replyCount ?? 0,
    pinned: !!o.pinned,
    clayReadAt: o.clayReadAt ?? null,
    deleted: false,
  };
}
function mkReply(o) {
  return {
    id: randomUUID(),
    threadId: o.threadId,
    parentReplyId: o.parentReplyId ?? null,
    authorEmail: o.authorEmail,
    body: o.body,
    createdAt: o.createdAt,
    editedAt: null,
    clayReadAt: o.clayReadAt ?? null,
    deleted: false,
  };
}

async function writeThread(t) {
  await redis.set(THREAD(t.id), JSON.stringify(t));
  await redis.zadd(THREADS_INDEX, { score: t.lastActivityAt, member: t.id });
}
async function writeReply(r) {
  await redis.set(REPLY(r.id), JSON.stringify(r));
  await redis.zadd(REPLIES_INDEX(r.threadId), { score: r.createdAt, member: r.id });
}

async function seedMember(o) {
  const record = {
    email: o.email,
    stripeCustomerId: `seed_${o.email}`,
    stripeSubscriptionId: `seed_${o.email}`,
    tier: o.tier,
    founderSlot: o.founderSlot ?? null,
    charterSlot: o.charterSlot ?? null,
    status: "active",
    interval: "month",
    amountCents: o.amountCents,
    createdAt: now,
    updatedAt: now,
    customAvatarUrl: null,
  };
  await redis.set(MEMBER(o.email), JSON.stringify(record));
}

async function main() {
  // Dev member fixtures so the standing chips render: a founder and a
  // charter member whose spend also earns the Hunter tier badge.
  await seedMember({
    email: "marcus.dev@example.com",
    tier: "founder",
    founderSlot: 7,
    amountCents: 800,
  });
  await seedMember({
    email: "denise.dev@example.com",
    tier: "charter",
    charterSlot: 12,
    amountCents: 2500,
  });

  // --- Pinned Question of the Week (Clay) ---
  const qotw = mkThread({
    authorEmail: admin,
    title: "What did this week show you about staying off the menu?",
    body:
      "DEV PLACEHOLDER. One thing this week. A moment you caught yourself being handled, or caught yourself not being. Keep it concrete.\n\nClay replaces this with the real prompt at launch.",
    createdAt: h(3),
    pinned: true,
  });
  await writeThread(qotw);
  await redis.set(PINNED, qotw.id);

  // --- Founding member thread #1 ---
  const founding = mkThread({
    authorEmail: "marcus.dev@example.com",
    title: "The deliberate destruction of the black family",
    category: "doctrine",
    body:
      "I have spent years reading the policy history here, from the welfare rules that penalized a father in the home to the incentives that followed. The pattern is too consistent to be accident.\n\nIs anyone else here who has thoroughly studied these issues? I want to compare sources and stop arguing from vibes.",
    createdAt: h(26),
  });

  const reply1 = mkReply({
    threadId: founding.id,
    authorEmail: "denise.dev@example.com",
    body:
      "Yes. Start with the man-in-the-house rules and the 1960s caseworker raids. The incentive structure did the rest. I'll pull citations tonight.",
    createdAt: h(20),
  });
  const reply1child = mkReply({
    threadId: founding.id,
    parentReplyId: reply1.id,
    authorEmail: "marcus.dev@example.com",
    body: "That's exactly the thread I lost. Thank you, please do.",
    createdAt: h(18),
  });
  const reply2 = mkReply({
    threadId: founding.id,
    authorEmail: admin,
    body:
      "This is the kind of thread the Guild is for. Bring the sources and I'll weigh in once it has legs.",
    createdAt: h(2),
    clayReadAt: h(1),
  });

  founding.replyCount = 3;
  founding.lastActivityAt = reply2.createdAt;
  founding.clayReadAt = h(1); // seal shows on the index + thread
  await writeThread(founding);
  await writeReply(reply1);
  await writeReply(reply1child);
  await writeReply(reply2);

  // --- A field engagement (so the index shows more than one tag) ---
  const field = mkThread({
    authorEmail: "denise.dev@example.com",
    title: "Cornered on 'do you even have a source' — here's the move",
    category: "field",
    body:
      "DEV PLACEHOLDER. He tried to make me the one defending while he risked nothing. I handed the burden back and asked him to show his own work first. He folded. Posting the exchange so we can break down why it worked.",
    createdAt: h(9),
  });
  await writeThread(field);

  // --- An open-floor thread ---
  const open = mkThread({
    authorEmail: "marcus.dev@example.com",
    title: "Thinking out loud: is 'apex class' the right frame, or too tidy?",
    category: "open",
    body:
      "DEV PLACEHOLDER. Half-formed. Sometimes the predator/prey frame clarifies, sometimes it flattens. Where does it stop being useful? Not trying to win anything here, just turning it over.",
    createdAt: h(5),
  });
  await writeThread(open);

  console.log("Seeded dev: Guild:");
  console.log(`  pinned QOTW   ${qotw.id}`);
  console.log(`  founding #1   ${founding.id}  (3 replies, 1 nested)`);
  console.log("\nVisit /guild while signed in as a member to see it.");
}

main().catch((err) => {
  console.error("guild:seed-dev failed:", err);
  process.exit(1);
});
