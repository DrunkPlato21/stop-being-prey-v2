// READ-ONLY inspector. Dumps every key tied to a given member email so
// we know exactly what an email migration has to move. No writes, ever.
//
//   node --env-file=.env.local scripts/inspect-member.mjs <email> [<email2> ...]

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const emails = process.argv.slice(2).map((e) => e.toLowerCase().trim());
if (emails.length === 0) {
  console.error("Usage: inspect-member.mjs <email> [<email2> ...]");
  process.exit(1);
}

function parse(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

for (const email of emails) {
  console.log("\n=================================================");
  console.log(`EMAIL: ${email}`);
  console.log("=================================================");

  const member = parse(await redis.get(`member:${email}`));
  console.log(`\nmember:${email} =>`);
  console.log(member ? JSON.stringify(member, null, 2) : "  (none)");

  if (member?.stripeCustomerId) {
    const byCust = await redis.get(
      `member:by-customer:${member.stripeCustomerId}`
    );
    console.log(`\nmember:by-customer:${member.stripeCustomerId} => ${byCust}`);
  }

  const score = await redis.zscore("members:all", email);
  console.log(`\nmembers:all score for ${email} => ${score}`);

  const profile = parse(await redis.get(`profile:${email}`));
  console.log(`\nprofile:${email} =>`);
  console.log(profile ? JSON.stringify(profile, null, 2) : "  (none)");

  if (profile?.displayName) {
    const norm = String(profile.displayName).toLowerCase().trim();
    const claim = await redis.get(`displayname:taken:${norm}`);
    console.log(`\ndisplayname:taken:${norm} => ${claim}`);
  }

  const notifIds = (await redis.zrange(`notifications:member:${email}`, 0, -1)) ?? [];
  console.log(`\nnotifications:member:${email} => ${JSON.stringify(notifIds)}`);
  const unread = await redis.get(`notifications:unread:${email}`);
  console.log(`notifications:unread:${email} => ${unread}`);
  for (const id of notifIds) {
    const rec = parse(await redis.get(`notification:${id}`));
    console.log(`  notification:${id} =>`, rec ? JSON.stringify(rec) : "(none)");
  }
}

console.log("\n(read-only — nothing was modified)");
