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
      "One thing this week. A moment you caught yourself being handled, or a moment you caught yourself refusing to be. Keep it concrete. No theory, no slogans. The specific beats the grand every time.\n\nI read every one of these.",
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
  founding.lastReplyId = reply2.id;
  founding.lastReplyAuthorEmail = reply2.authorEmail;
  founding.clayReadAt = h(1); // seal shows on the index + thread
  await writeThread(founding);
  await writeReply(reply1);
  await writeReply(reply1child);
  await writeReply(reply2);

  // --- The Doctrine: Rule II, laid down by Clay (a seed-thread shape:
  //     a rule stated plainly, ending in a real question) ---
  const ruleII = mkThread({
    authorEmail: admin,
    title: "Rule II: the audience is the prize",
    category: "doctrine",
    body:
      "You are almost never arguing with the person in front of you. You are performing for everyone watching who has not made up their mind yet. The man you think you are debating is usually lost already. He is a prop. Treat him like one.\n\nThe moment you start trying to convince him, you have lost the room. You look like you need something from him. Need is prey behavior.\n\nWhere do you still catch yourself playing to the opponent instead of the audience?",
    createdAt: h(16),
  });
  const rIIr1 = mkReply({
    threadId: ruleII.id,
    authorEmail: "denise.dev@example.com",
    body:
      "This one rewired me. I stopped writing paragraphs at the guy and started writing for the lurkers. Shorter, colder, and it landed harder.",
    createdAt: h(9),
  });
  const rIIr2 = mkReply({
    threadId: ruleII.id,
    authorEmail: admin,
    body: "Right. Quote him once for the record, then talk past him to the room.",
    createdAt: h(3),
    clayReadAt: h(3),
  });
  ruleII.replyCount = 2;
  ruleII.lastActivityAt = rIIr2.createdAt;
  ruleII.lastReplyId = rIIr2.id;
  ruleII.lastReplyAuthorEmail = rIIr2.authorEmail;
  ruleII.clayReadAt = h(3);
  await writeThread(ruleII);
  await writeReply(rIIr1);
  await writeReply(rIIr2);

  // --- The Field: a clean breakdown, sealed by Clay ---
  const field = mkThread({
    authorEmail: "denise.dev@example.com",
    title: "Cornered on 'do you even have a source'. Here's the move.",
    category: "field",
    body:
      "Classic burden flip. He makes a sweeping claim, then the second you push back he demands that YOU produce a peer reviewed citation while he has produced nothing. Now you are on defense for his argument.\n\nThe move is to hand it back. You made the claim. Show your work first and I will match it. He folds, or he exposes that he has nothing. Either way the room sees it.\n\nLeaving the rest of the exchange below. Tell me if I left anything on the table.",
    createdAt: h(11),
  });
  const fr1 = mkReply({
    threadId: field.id,
    authorEmail: admin,
    body:
      "Clean. Rule III, you named the move out loud. Rule II, you did it for the room and not for him.",
    createdAt: h(6),
    clayReadAt: h(6),
  });
  field.replyCount = 1;
  field.lastActivityAt = fr1.createdAt;
  field.lastReplyId = fr1.id;
  field.lastReplyAuthorEmail = fr1.authorEmail;
  field.clayReadAt = h(6);
  await writeThread(field);
  await writeReply(fr1);

  // --- The Field: a live ask (present tense, the killer use) ---
  const liveAsk = mkThread({
    authorEmail: "marcus.dev@example.com",
    title: "I'm in one right now. He keeps moving the goalposts. What's the play?",
    category: "field",
    body:
      "Live, happening tonight. Every time I answer he shifts the standard. First it was show me data. I showed data. Now it is that the source is biased. Next it will be well it is more complicated. I can feel myself getting walked in a circle.\n\nDo I name the pattern and stop, or keep feeding it? I do not want to look like I ran.",
    createdAt: h(4),
  });
  const lar1 = mkReply({
    threadId: liveAsk.id,
    authorEmail: "denise.dev@example.com",
    body:
      "Name it and stop. Say the standard has moved three times, that is not a search for truth it is a stall, and you are good. Then leave. That is Rule IV. Walking away is the win here.",
    createdAt: h(3),
  });
  liveAsk.replyCount = 1;
  liveAsk.lastActivityAt = lar1.createdAt;
  liveAsk.lastReplyId = lar1.id;
  liveAsk.lastReplyAuthorEmail = lar1.authorEmail;
  await writeThread(liveAsk);
  await writeReply(lar1);

  // --- The Doctrine: a member working a rule (no replies yet, fresh) ---
  const ruleVII = mkThread({
    authorEmail: "denise.dev@example.com",
    title: "Rule VII in practice: hostility funds the work",
    category: "doctrine",
    body:
      "Took me a while to believe this one. Every furious reply, every quote post trying to bury you, hands you reach and proof you touched a nerve. The people working hardest to silence you turn into your best distribution.\n\nThe discipline is to stop flinching at the incoming and start reading it as fuel. Has anyone actually watched their loudest hater grow their audience? I want concrete stories, not theory.",
    createdAt: h(7),
  });
  await writeThread(ruleVII);

  // --- Open floor ---
  const open = mkThread({
    authorEmail: "marcus.dev@example.com",
    title: "Thinking out loud: is 'apex class' the right frame, or too tidy?",
    category: "open",
    body:
      "Half formed, bear with me. Some days the predator and prey frame cuts straight to the bone. Other days I worry it flattens people into roles and gives me an excuse to stop looking closer.\n\nWhere does it stop being useful? Not trying to win anything here. Just turning it over in the open.",
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
