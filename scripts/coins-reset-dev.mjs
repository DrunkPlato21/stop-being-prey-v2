import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Dev-only: wipe ALL coin data living under the `dev:` keyspace so you
// can re-test the coins feature from a clean slate.
//
// Usage:  npm run coins:reset-dev
//
// SAFETY (three independent guards — read before trusting it):
//   1. Refuses to run when NODE_ENV=production.
//   2. Only ever SCANs `dev:`-prefixed patterns, so production keys
//      (which have NO prefix — see src/lib/coins.ts) are never even
//      enumerated.
//   3. Belt-and-suspenders: every key is re-checked to start with
//      `dev:` immediately before deletion. A key without that prefix is
//      skipped and loudly reported, so a mistake can't delete prod data.
//
// What it deletes (all under dev:):
//   dev:coins:spent:*      one-coin-per-piece locks
//   dev:coins:comment:*    per-comment giver sets
//   dev:coins:score:*      per-piece ranking/sort sets
//   dev:coins:received:*   per-recipient ledgers
//   dev:coin-receipt:*     individual receipt records

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Guard 1: never in production --------------------------------------
if (process.env.NODE_ENV === "production") {
  console.error(
    "REFUSING: NODE_ENV=production. This script only clears the dev: keyspace."
  );
  process.exit(1);
}

// Load .env.local manually (no dotenv dependency in this project).
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
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (.env.local)."
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

// The ONLY prefix this script is allowed to touch. Must match the dev
// branch of KEY_PREFIX in src/lib/coins.ts.
const SAFE_PREFIX = "dev:";

// Patterns are all dev:-scoped, so SCAN never enumerates prod keys.
const PATTERNS = [
  "dev:coins:spent:*",
  "dev:coins:comment:*",
  "dev:coins:score:*",
  "dev:coins:received:*",
  "dev:coin-receipt:*",
];

async function scanAll(pattern) {
  const found = [];
  let cursor = "0";
  do {
    // Upstash returns [nextCursor, keys]
    const [next, keys] = await redis.scan(cursor, {
      match: pattern,
      count: 200,
    });
    cursor = next;
    if (Array.isArray(keys)) found.push(...keys);
  } while (cursor !== "0");
  return found;
}

async function main() {
  console.log(`Scanning the ${SAFE_PREFIX} keyspace for coin keys…\n`);

  const all = new Set();
  for (const pattern of PATTERNS) {
    const keys = await scanAll(pattern);
    console.log(`  ${pattern.padEnd(26)} ${keys.length} keys`);
    for (const k of keys) all.add(k);
  }

  const keys = [...all];

  // --- Guard 3: re-verify every key is dev:-prefixed --------------------
  const unsafe = keys.filter((k) => !k.startsWith(SAFE_PREFIX));
  if (unsafe.length > 0) {
    console.error(
      `\nREFUSING: ${unsafe.length} key(s) did not start with "${SAFE_PREFIX}". ` +
        `Aborting without deleting anything.\nExamples: ${unsafe
          .slice(0, 5)
          .join(", ")}`
    );
    process.exit(1);
  }

  if (keys.length === 0) {
    console.log("\nNothing to delete — the dev: coin keyspace is already clean.");
    return;
  }

  // Delete in batches so a huge keyspace doesn't blow the request size.
  let deleted = 0;
  const BATCH = 100;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    deleted += await redis.del(...slice);
  }

  console.log(`\nDeleted ${deleted} dev: coin key(s). Clean slate.`);
}

main().catch((err) => {
  console.error("coins:reset-dev failed:", err);
  process.exit(1);
});
