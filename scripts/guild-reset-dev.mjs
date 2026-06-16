import { Redis } from "@upstash/redis";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Dev-only: wipe ALL Guild data under the `dev:` keyspace for a clean
// re-test. Modeled on coins-reset-dev.mjs.
//
// Usage:  npm run guild:reset-dev
//
// SAFETY (three independent guards):
//   1. Refuses to run when NODE_ENV=production.
//   2. Only ever SCANs `dev:`-prefixed patterns, so production keys
//      (which have NO prefix — see src/lib/guild.ts) are never enumerated.
//   3. Every key is re-checked to start with `dev:` before deletion.
//
// What it deletes (all under dev:):
//   dev:guild:*   threads, replies, indexes, pinned pointer, rate limits

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
// branch of KEY_PREFIX in src/lib/guild.ts.
const SAFE_PREFIX = "dev:";
const PATTERNS = ["dev:guild:*"];

async function scanAll(pattern) {
  const found = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: pattern, count: 200 });
    cursor = next;
    if (Array.isArray(keys)) found.push(...keys);
  } while (cursor !== "0");
  return found;
}

async function main() {
  console.log(`Scanning the ${SAFE_PREFIX} keyspace for Guild keys…\n`);

  const all = new Set();
  for (const pattern of PATTERNS) {
    const keys = await scanAll(pattern);
    console.log(`  ${pattern.padEnd(16)} ${keys.length} keys`);
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
    console.log("\nNothing to delete — the dev: Guild keyspace is already clean.");
    return;
  }

  let deleted = 0;
  const BATCH = 100;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    deleted += await redis.del(...slice);
  }

  console.log(`\nDeleted ${deleted} dev: Guild key(s). Clean slate.`);
}

main().catch((err) => {
  console.error("guild:reset-dev failed:", err);
  process.exit(1);
});
