import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Read-only: dump every on-site comment (and its member replies) to a single
// skimmable markdown file so Clay can mine it for testimonials. Writes NOTHING
// to Redis. Comments are already public on the site, so this is just a
// convenient transcript, not private data.
//
// Only approved comments are included (those are the ones actually live on the
// site). FEATURED comments — the ones Clay already hand-curated — are flagged
// up top, since those are the likeliest gold.
//
// Usage:  npm run comments:export   (output: export/comments-export.md)

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, "..", ".env.local");
let env = {};
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const url = env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.");
  process.exit(1);
}
const redis = new Redis({ url, token });

const ALL_INDEX_KEY = "comments:all";
const COMMENT_PREFIX = "comment:";

const fmtDate = (ms) =>
  typeof ms === "number" ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : "?";

const asObj = (v) =>
  !v ? null : typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;

const isApproved = (c) => c.approved !== false; // legacy = approved

async function main() {
  const ids = await redis.zrange(ALL_INDEX_KEY, 0, -1, { rev: true });
  if (!ids || ids.length === 0) {
    console.log("No comments found (comments:all empty).");
    return;
  }

  const lines = [];
  let count = 0;
  let replyTotal = 0;
  let featuredCount = 0;
  let skipped = 0;

  for (const id of ids) {
    const c = asObj(await redis.get(`${COMMENT_PREFIX}${id}`));
    if (!c) continue;
    if (!isApproved(c)) { skipped++; continue; }
    if (c.paymentStatus === "awaiting_payment") { skipped++; continue; }
    count++;
    if (c.featured) featuredCount++;

    const tag = c.featured ? "  ⭐ FEATURED" : "";
    lines.push("---");
    lines.push("");
    lines.push(
      `### ${c.displayName || "A member"} · on "${c.slug}" (${c.kind}) · ${fmtDate(c.createdAt)}${tag}`
    );
    lines.push(`email: ${c.email || "?"}`);
    lines.push("");
    lines.push((c.body || "").trim() || "_(no text)_");
    lines.push("");
    if (c.replyBody) {
      lines.push(`> **Clay replied:** ${c.replyBody.trim()}`);
      lines.push("");
    }
    for (const r of c.threadReplies || []) {
      if (!r || !r.body) continue;
      replyTotal++;
      lines.push(`>> **${r.displayName || "A member"}** (${r.email || "?"}) · ${fmtDate(r.createdAt)}`);
      for (const l of r.body.trim().split("\n")) lines.push(`>> ${l}`);
      lines.push("");
    }
  }

  lines.unshift("");
  lines.unshift(
    `> ${count} approved comments · ${replyTotal} member replies · ${featuredCount} FEATURED · ${skipped} skipped (pending/draft)`
  );
  lines.unshift("# Comments export");

  const outDir = join(__dirname, "..", "export");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "comments-export.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}\n${count} comments, ${replyTotal} replies, ${featuredCount} featured.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
