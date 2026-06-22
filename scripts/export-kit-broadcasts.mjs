// READ-ONLY export of every Kit broadcast (sent + draft) with subject,
// preview text, body (HTML + stripped plain text), dates, and the send
// stats (recipients / open rate / clicks / unsubscribes). Writes two
// files to export/ (gitignored): one JSON (full fidelity) + one CSV.
//
// Kit v4 endpoints used: GET /v4/broadcasts (content is inline on the
// list), GET /v4/broadcasts/{id}/stats. No writes, ever.
//
//   node --env-file=.env.local scripts/export-kit-broadcasts.mjs

import { mkdir, writeFile } from "fs/promises";
import path from "path";

const key = process.env.KIT_API_KEY;
if (!key) {
  console.error("Missing KIT_API_KEY in env.");
  process.exit(1);
}
const headers = { "X-Kit-Api-Key": key, Accept: "application/json" };

// --- helpers -------------------------------------------------------

// Strip HTML to readable plain text: drop style/script, turn block
// boundaries into newlines, remove remaining tags, decode the common
// entities, collapse runaway whitespace.
function htmlToText(html) {
  if (typeof html !== "string") return "";
  let s = html;
  s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|table|blockquote)\s*>/gi, "\n");
  s = s.replace(/<\s*li[^>]*>/gi, " - ");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "’")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Quote when the cell holds a comma, quote, or newline; double inner quotes.
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function fetchAllBroadcasts() {
  const all = [];
  let cursor = null;
  do {
    const u = new URL("https://api.kit.com/v4/broadcasts");
    u.searchParams.set("per_page", "500");
    if (cursor) u.searchParams.set("after", cursor);
    const r = await fetch(u, { headers });
    if (!r.ok) {
      throw new Error(`broadcasts list failed: ${r.status} ${await r.text()}`);
    }
    const d = await r.json();
    all.push(...(d.broadcasts ?? []));
    cursor = d.pagination?.has_next_page ? d.pagination.end_cursor : null;
  } while (cursor);
  return all;
}

async function fetchStats(id) {
  try {
    const r = await fetch(`https://api.kit.com/v4/broadcasts/${id}/stats`, {
      headers,
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.broadcast?.stats ?? null;
  } catch {
    return null;
  }
}

// Run promise-returning thunks in small concurrent batches to respect
// Kit's rate limit while staying faster than one-at-a-time.
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
    process.stdout.write(`\r  stats ${Math.min(i + size, items.length)}/${items.length}`);
  }
  process.stdout.write("\n");
  return out;
}

// --- main ----------------------------------------------------------

console.log("Fetching broadcasts...");
const broadcasts = await fetchAllBroadcasts();
console.log(`  ${broadcasts.length} broadcasts.`);

console.log("Fetching per-broadcast stats...");
const statsList = await inBatches(broadcasts, 5, (b) => fetchStats(b.id));

const rows = broadcasts.map((b, i) => {
  const stats = statsList[i] ?? {};
  const contentHtml = typeof b.content === "string" ? b.content : "";
  return {
    id: b.id,
    status: b.status ?? null,
    public: b.public ?? null,
    created_at: b.created_at ?? null,
    published_at: b.published_at ?? null,
    send_at: b.send_at ?? null,
    subject: b.subject ?? "",
    preview_text: b.preview_text ?? "",
    description: b.description ?? "",
    recipients: stats.recipients ?? null,
    open_rate: stats.open_rate ?? null,
    emails_opened: stats.emails_opened ?? null,
    click_rate: stats.click_rate ?? null,
    total_clicks: stats.total_clicks ?? null,
    unsubscribes: stats.unsubscribes ?? null,
    unsubscribe_rate: stats.unsubscribe_rate ?? null,
    public_url: b.public_url ?? null,
    subscriber_filter: b.subscriber_filter ?? null,
    content_text: htmlToText(contentHtml),
    content_html: contentHtml,
  };
});

// Newest first by send_at (fall back to created_at).
rows.sort((a, b) => {
  const ad = Date.parse(a.send_at || a.created_at || "") || 0;
  const bd = Date.parse(b.send_at || b.created_at || "") || 0;
  return bd - ad;
});

// --- write JSON (full fidelity) ------------------------------------
const outDir = path.join(process.cwd(), "export");
await mkdir(outDir, { recursive: true });
const jsonPath = path.join(outDir, "kit-broadcasts.json");
await writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf8");

// --- write CSV (everything except raw HTML) ------------------------
const cols = [
  "id",
  "status",
  "public",
  "created_at",
  "published_at",
  "send_at",
  "subject",
  "preview_text",
  "description",
  "recipients",
  "open_rate",
  "emails_opened",
  "click_rate",
  "total_clicks",
  "unsubscribes",
  "unsubscribe_rate",
  "public_url",
  "content_text",
];
const csvLines = [cols.join(",")];
for (const row of rows) {
  csvLines.push(cols.map((c) => csvCell(row[c])).join(","));
}
const csvPath = path.join(outDir, "kit-broadcasts.csv");
// Prepend a UTF-8 BOM so Excel reads the curly quotes / dashes correctly.
await writeFile(csvPath, "﻿" + csvLines.join("\r\n"), "utf8");

console.log(`\nWrote:`);
console.log(`  ${jsonPath}  (${rows.length} broadcasts, full + raw HTML)`);
console.log(`  ${csvPath}  (${rows.length} rows, text + stats)`);
const sent = rows.filter((r) => r.recipients);
const totalRecips = sent.reduce((n, r) => n + (r.recipients || 0), 0);
console.log(
  `  ${sent.length} sent broadcasts, ${totalRecips.toLocaleString()} total recipients.`
);
