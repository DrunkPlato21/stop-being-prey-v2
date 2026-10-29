// Snapshot Clay's sent Kit broadcasts into content/emails/archive.json,
// the baseline the patron email archive (/emails) renders from.
//
// The site does not depend on this being run: lib/email-archive.ts also
// asks Kit for anything newer than the snapshot at request time (cached
// for 15 minutes), so a new email shows up on its own. Running this just
// folds those into the repo so the live lookup stays a page or two, and
// so the archive still renders in full if Kit is ever unreachable. Good
// habit: run it before a deploy.
//
// READ-ONLY against Kit (GET /v4/broadcasts). Never writes to Kit.
//
// Run:
//   npx tsx scripts/sync-email-archive.mts      (or: npm run emails:sync)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  fetchKitBroadcasts,
  isArchivable,
  toArchivedEmail,
} from "../src/lib/email-archive-core.ts";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const apiKey = process.env.KIT_API_KEY;
if (!apiKey) {
  console.error("Missing KIT_API_KEY in .env.local.");
  process.exit(1);
}

const broadcasts = await fetchKitBroadcasts({ apiKey });
const emails = broadcasts
  .filter(isArchivable)
  .map(toArchivedEmail)
  .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));

const dir = path.join(process.cwd(), "content", "emails");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, "archive.json");
writeFileSync(file, JSON.stringify(emails, null, 1) + "\n");

console.log(
  `Fetched ${broadcasts.length} broadcasts, archived ${emails.length} ` +
    `(${emails.at(-1)?.sentAt.slice(0, 10)} to ${emails[0]?.sentAt.slice(0, 10)}).`
);
console.log(`Wrote ${path.relative(process.cwd(), file)}`);
