// Export every sealed Arena bout to markdown: one file per case in
// content/arena-cases/. Three jobs, one format:
//   1. Git durability — Redis is the live store, the repo is the vault.
//   2. Book material — the manuscript export path starts here.
//   3. The training corpus — Clay's plan: members feed their AI these
//      case files as a fight companion ("here's how Clay handles a
//      sniper — coach me like this"). So the format is deliberately
//      machine-clean: strict frontmatter, one labeled section per
//      tile, transcripts fenced, moves named.
//
//   node scripts/export-arena-cases.mjs          (dev keyspace)
//   node scripts/export-arena-cases.mjs --prod   (production keyspace)
//
// Idempotent: stable filenames (case number + slug), overwrites in
// place. Never deletes — a bout removed from Redis keeps its file
// until you remove it deliberately.

import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
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

const PROD = process.argv.includes("--prod");
const PREFIX = PROD ? "" : (process.env.ARENA_KEY_PREFIX ?? "dev:");
const OUT_DIR = join(__dirname, "..", "content", "arena-cases");

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing Upstash env.");
  process.exit(1);
}
const redis = new Redis({ url, token });

// Arsenal names resolve from the same snapshot the site uses.
const moves = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "lib", "arsenal-moves.json"), "utf8")
);
const moveBySlug = new Map(moves.map((m) => [m.slug, m]));
const moveName = (tag) => moveBySlug.get(tag)?.name ?? tag;
const moveRole = (tag) => moveBySlug.get(tag)?.role ?? null;

const TILE_LABEL = {
  specimen: "The Specimen",
  read: "The Read",
  counter: "The Counter",
  result: "The Result",
  verdict: "The Verdict",
};

const parse = (raw) => {
  if (raw === null || raw === undefined) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const iso = (ms) => new Date(ms).toISOString();
const yq = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const boutIds = await redis.zrange(`${PREFIX}arena:bouts`, 0, -1);
mkdirSync(OUT_DIR, { recursive: true });
let exported = 0;

for (const id of boutIds) {
  const bout = parse(await redis.get(`${PREFIX}arena:bout:${id}`));
  if (!bout || bout.status !== "sealed") continue;

  const tileIds = await redis.zrange(`${PREFIX}arena:bout:${id}:tiles`, 0, -1);
  const tiles = [];
  for (const tid of tileIds) {
    const tile = parse(await redis.get(`${PREFIX}arena:tile:${tid}`));
    if (!tile) continue;
    const reactedBy =
      (await redis.hgetall(`${PREFIX}arena:tile:${tid}:reactedby`)) ?? {};
    const reactions = {};
    for (const key of Object.values(reactedBy)) {
      reactions[key] = (reactions[key] ?? 0) + 1;
    }
    tiles.push({ ...tile, reactions });
  }

  const allMoves = [...new Set(tiles.flatMap((t) => t.moves ?? []))];
  const no =
    bout.caseNo != null ? String(bout.caseNo).padStart(3, "0") : "unnumbered";
  const filename = `case-${no}-${slugify(bout.title)}.md`;

  const fm = [
    "---",
    `title: ${yq(bout.title)}`,
    `case_no: ${bout.caseNo ?? "null"}`,
    `archetype: ${bout.archetype ? yq(bout.archetype) : "null"}`,
    `rules_applied: ${bout.rulesApplied ? yq(bout.rulesApplied) : "null"}`,
    `sealed_at: ${yq(iso(bout.sealedAt ?? bout.lastTileAt))}`,
    `public: ${bout.publicAt ? "true" : "false"}`,
    `bout_id: ${yq(bout.id)}`,
    `tile_count: ${tiles.length}`,
    allMoves.length
      ? `moves:\n${allMoves
          .map(
            (m) =>
              `  - name: ${yq(moveName(m))}\n    role: ${moveRole(m) ?? "unnamed"}`
          )
          .join("\n")}`
      : "moves: []",
    "---",
  ].join("\n");

  const sections = [];
  if (bout.dispatch) sections.push(`> ${bout.dispatch}\n`);
  tiles.forEach((tile, i) => {
    const head = `## ${i + 1}. ${TILE_LABEL[tile.type] ?? tile.type}`;
    const lines = [head, ""];
    if (tile.handle) lines.push(`**Handle:** ${tile.handle}`, "");
    lines.push(tile.body, "");
    if (tile.transcript) {
      lines.push("**Transcript (verbatim, on file):**", "", "```", tile.transcript, "```", "");
    }
    if (tile.imageUrl) {
      lines.push(`**Screenshot:** ${tile.imageUrl}`, "");
    }
    if ((tile.moves ?? []).length > 0) {
      lines.push(
        `**Moves:** ${tile.moves
          .map((m) => {
            const role = moveRole(m);
            const mark = role === "clay" ? "✦" : role === "opponent" ? "◆" : "·";
            return `${mark} ${moveName(m)}`;
          })
          .join(" / ")}`,
        ""
      );
    }
    const rx = Object.entries(tile.reactions ?? {});
    if (rx.length > 0) {
      lines.push(
        `**Room reactions:** ${rx.map(([k, n]) => `${k} ×${n}`).join(", ")}`,
        ""
      );
    }
    sections.push(lines.join("\n"));
  });

  const doc = `${fm}\n\n# ${bout.title}\n\n${sections.join("\n")}`;
  writeFileSync(join(OUT_DIR, filename), doc, "utf8");
  console.log(`exported ${filename} (${tiles.length} tiles)`);
  exported++;
}

console.log(
  `${exported} sealed ${exported === 1 ? "case" : "cases"} -> content/arena-cases/ [${PROD ? "PROD" : "dev"} keyspace]`
);
