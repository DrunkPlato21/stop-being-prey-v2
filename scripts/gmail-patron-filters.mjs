// Generate importable Gmail filters that label every current patron's mail.
//
//   node scripts/gmail-patron-filters.mjs
//
// Reads the PRODUCTION member roster from Upstash (unprefixed `members:all`
// ZSET + `member:<email>` JSON), keeps active / trialing / past_due, skips
// `dev_` test customers, and writes export/patron-filters.xml (+ .txt).
//
// Import: Gmail → Settings → Filters and Blocked Addresses → Import filters.
// DELETE the old `patron` filters first or Gmail stacks duplicates, and tick
// "Apply new filters to existing conversations" to label back-mail too.
// Read-only against Redis.
import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    })
);
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const KEEP = new Set(["active", "trialing", "past_due"]);
const emails = (await redis.zrange("members:all", 0, -1)).filter(
  (e) => typeof e === "string"
);
const patrons = [];
for (const email of emails) {
  const raw = await redis.get(`member:${email}`);
  if (!raw) continue;
  const rec = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (rec?.stripeCustomerId?.startsWith("dev_")) continue;
  if (KEEP.has(rec?.status)) patrons.push(email.toLowerCase());
}
patrons.sort();

// Gmail truncates long filter criteria, so chunk the OR-list.
const chunks = [];
let cur = [];
for (const e of patrons) {
  const next = [...cur, e].join(" OR ");
  if (next.length > 1100 && cur.length) {
    chunks.push(cur);
    cur = [e];
  } else cur.push(e);
}
if (cur.length) chunks.push(cur);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
const entries = chunks
  .map(
    (c) => `  <entry>
    <category term='filter'></category>
    <title>Mail Filter</title>
    <content></content>
    <apps:property name='from' value='${esc(c.join(" OR "))}'/>
    <apps:property name='label' value='patron'/>
    <apps:property name='shouldAlwaysMarkAsImportant' value='true'/>
    <apps:property name='shouldNeverSpam' value='true'/>
  </entry>`
  )
  .join("\n");
const xml = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:apps='http://schemas.google.com/apps/2006'>
  <title>Mail Filters</title>
${entries}
</feed>
`;
fs.mkdirSync("export", { recursive: true });
fs.writeFileSync(path.join("export", "patron-filters.xml"), xml);
fs.writeFileSync(
  path.join("export", "patron-filters.txt"),
  chunks.map((c) => c.join(" OR ")).join("\n\n") + "\n"
);
console.log(
  `${patrons.length} patrons, ${chunks.length} filters -> export/patron-filters.xml`
);
