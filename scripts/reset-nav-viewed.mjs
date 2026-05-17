// One-shot dev helper: clear a member's nav-viewed timestamps so the
// gold dots in the members-area left rail fire on their next page load.
// Useful for eyeballing the dot UI without waiting for new content to
// land.
//
// Defaults to clearing the case-files and field-notes timestamps only;
// the lounge dot is driven by lounge:lastviewed:<email>, which is reset
// by passing --include-lounge.
//
// Usage (Node 20+):
//
//   node --env-file=.env.local scripts/reset-nav-viewed.mjs \
//        --email <addr>
//
//   node --env-file=.env.local scripts/reset-nav-viewed.mjs \
//        --email <addr> --include-lounge
//
//   node --env-file=.env.local scripts/reset-nav-viewed.mjs \
//        --email <addr> --section field-notes

import { Redis } from "@upstash/redis";

const argv = process.argv.slice(2);

function readFlag(name) {
  const idx = argv.indexOf(`--${name}`);
  return idx === -1 ? null : argv[idx + 1] ?? null;
}

const email = (readFlag("email") ?? "").toLowerCase().trim();
const section = readFlag("section");
const includeLounge = argv.includes("--include-lounge");

if (!email) {
  console.error(
    "Usage: --email <addr> [--section <case-files|field-notes>] [--include-lounge]"
  );
  process.exit(2);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in env."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

const navSections = ["case-files", "field-notes"];
const sections = section ? [section] : navSections;

const keys = sections.map((s) => `nav:viewed:${s}:${email}`);
if (includeLounge && !section) {
  keys.push(`lounge:lastviewed:${email}`);
}

console.log(`Clearing nav-viewed timestamps for ${email}:`);
for (const key of keys) {
  const removed = await redis.del(key).catch(() => 0);
  console.log(`  ${removed ? "removed" : "absent "} ${key}`);
}

console.log("\nReload /desk to see the dots.");
