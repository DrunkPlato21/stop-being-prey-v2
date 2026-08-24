// Re-send an already-sent weekly digest to members who missed it.
//
// Built for the 2026-08-09 Resend daily-quota incident: the Sunday cron
// sent 144 of 155 and the last 11 hit the quota wall. The cron cannot
// re-fire (the week is claimed, by design), and re-assembling the digest
// after the run would produce a different payload (the shipped window
// opens at the last run's sentAt). So instead this copies the EXACT
// email that went out, byte for byte, from Resend's own send log, and
// swaps in a fresh per-recipient unsubscribe token. The body carries no
// other per-recipient content (verified: recipient address never
// appears in html or text).
//
//   Dry run (prints plan, sends nothing):
//     node --env-file=.env.local scripts/resend-digest-copy.mjs --source <resend-email-id> a@b.com c@d.com
//   Actually send:
//     node --env-file=.env.local scripts/resend-digest-copy.mjs --source <resend-email-id> --send a@b.com c@d.com

import { SignJWT, jwtVerify } from "jose";

const RESEND_KEY = process.env.RESEND_API_KEY;
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!RESEND_KEY || !AUTH_SECRET) {
  console.error("Missing RESEND_API_KEY / AUTH_SECRET.");
  process.exit(1);
}
const secret = new TextEncoder().encode(AUTH_SECRET);
const H = { Authorization: `Bearer ${RESEND_KEY}` };

// Same sender identity as lib/email.ts. Duplicated on purpose: this
// script must not import app code (dev keyspace prefixes would kick in).
const FROM_ADDRESS = "Stop Being Prey <noreply@stopbeingprey.com>";
const REPLY_TO = "clay@stopbeingprey.com";
const DIGEST_TOKEN_TTL_DAYS = 365;

const argv = process.argv.slice(2);
const send = argv.includes("--send");
const srcIdx = argv.indexOf("--source");
const sourceId = srcIdx >= 0 ? argv[srcIdx + 1] : null;
const recipients = argv.filter(
  (a, i) => !a.startsWith("--") && i !== srcIdx + 1
);
if (!sourceId || recipients.length === 0) {
  console.error("Usage: resend-digest-copy.mjs --source <resend-email-id> [--send] email...");
  process.exit(1);
}

const res = await fetch(`https://api.resend.com/emails/${sourceId}`, { headers: H });
if (!res.ok) {
  console.error(`Could not fetch source email: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const src = await res.json();
const { html, text, subject } = src;
if (!html || !text) {
  console.error("Source email has no html/text body.");
  process.exit(1);
}

// The one per-recipient piece: the unsubscribe token. Everything else
// in the body is shared. JWT charset is URL-safe, so the token appears
// verbatim even inside encodeURIComponent'd URLs.
const tokenMatches = [...new Set([...html.matchAll(/token=([^"&]+)/g)].map((m) => m[1]))];
if (tokenMatches.length !== 1) {
  console.error(`Expected exactly one token in source html, found ${tokenMatches.length}. Refusing.`);
  process.exit(1);
}
const oldToken = tokenMatches[0];

// The unsubscribe origin, read off the email itself rather than
// reconstructed, so this stays right even if baseUrl conventions move.
const unsubUrl = html.match(/https?:\/\/[^"]+\/digest\/unsubscribe\?token=/)?.[0];
if (!unsubUrl) {
  console.error("Could not find unsubscribe URL in source html. Refusing.");
  process.exit(1);
}
const origin = new URL(unsubUrl).origin;

console.log(`source: ${sourceId} (to ${src.to}, ${src.created_at}, ${src.last_event})`);
console.log(`subject: "${subject}" | origin: ${origin} | mode: ${send ? "SEND" : "dry run"}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
let bad = 0;

for (const to of recipients) {
  const email = to.toLowerCase().trim();
  const token = await new SignJWT({ purpose: "digest-unsub", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DIGEST_TOKEN_TTL_DAYS}d`)
    .sign(secret);
  // Belt and braces: prove the freshly minted token verifies before it
  // is baked into a member's footer.
  const { payload } = await jwtVerify(token, secret);
  if (payload.purpose !== "digest-unsub" || payload.email !== email) {
    console.error(`  ${email}: minted token failed self-verify, skipping`);
    bad++;
    continue;
  }

  if (!send) {
    console.log(`  would send to ${email} (token ok, ${token.length} chars)`);
    continue;
  }

  const body = {
    from: FROM_ADDRESS,
    to: email,
    subject,
    html: html.replaceAll(oldToken, token),
    text: text.replaceAll(oldToken, token),
    reply_to: REPLY_TO,
    headers: {
      "List-Unsubscribe": `<${origin}/api/digest/unsubscribe?token=${encodeURIComponent(token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await r.json();
  if (r.ok && out.id) {
    console.log(`  sent to ${email} (resend id: ${out.id})`);
    ok++;
  } else {
    console.error(`  FAILED for ${email}: ${r.status} ${JSON.stringify(out)}`);
    bad++;
  }
  // Resend's request rate limit is per second regardless of plan.
  await sleep(650);
}

if (send) console.log(`done: ${ok} sent, ${bad} failed`);
