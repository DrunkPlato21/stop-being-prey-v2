import type { NextRequest } from "next/server";
import {
  assembleDigest,
  claimWeeklyRun,
  consumeChamberedNote,
  finishWeeklyRun,
  listDigestUnsubscribed,
  weekKeyFor,
  type DigestRun,
} from "@/lib/digest";
import { listActiveMemberEmails } from "@/lib/members";
import { isAdmin } from "@/lib/comments";
import { signDigestToken } from "@/lib/auth";
import { baseUrl } from "@/lib/membership";
import { sendWeeklyDigestEmail } from "@/lib/email";

// GET /api/cron/weekly-digest
// Sunday sweep (vercel.json cron): assemble one digest payload, send it
// to every active member who hasn't opted out. The payload is built
// once (every member gets the same report; only the unsubscribe token
// differs), and the week is claimed with SET NX before anything sends,
// so a Vercel retry or an accidental manual hit can't double-email the
// whole membership.
//
// The chambered note is consumed only after at least one send succeeds,
// and only if it's still the same note that went out — a note Clay
// loads mid-send belongs to next week, not the bin.
//
// Guarded by CRON_SECRET like gift-reminders: a local dev server
// pointing at shared Redis can't mass-email members. Dev safety is
// double anyway (dev member index is namespaced and empty).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Resend allows 10 requests per second on this account. The old loop
// fired five at a time with NO pause between batches, which at roughly
// 100ms a send is about fifty requests a second: four out of five came
// back 429 and were counted as ordinary failures. Aug 16 and Aug 23
// both reached exactly 40 members (of 162 and 171), because both runs
// tore through the list in about four seconds and only ~10/second got
// through. Pacing each batch into a one-second slot puts the run at
// five a second, half the ceiling, and finishes 171 members in ~35s
// against a 300s budget.
const SEND_CONCURRENCY = 5;
const BATCH_INTERVAL_MS = 1000;

// A throttled or blipped send must not silently drop a member from the
// week. Retry passes only ever re-send addresses whose send came back
// FAILED, so a retry can't duplicate a digest that already landed.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [3000, 8000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not configured.", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const now = Date.now();
  const weekKey = weekKeyFor(now);
  const claimed = await claimWeeklyRun(weekKey);
  if (!claimed) {
    return Response.json({ ok: true, skipped: "already_ran", weekKey });
  }

  const [payload, allEmails, unsubbed] = await Promise.all([
    assembleDigest(now),
    listActiveMemberEmails(),
    listDigestUnsubscribed(),
  ]);

  const site = baseUrl();
  const recipients = allEmails.filter(
    (email) => !isAdmin(email) && !unsubbed.has(email.toLowerCase().trim())
  );
  const unsubSkipped = allEmails.length - recipients.length;

  let sent = 0;
  const lastError = new Map<string, string>();

  // Each pass sweeps whoever is still unsent, paced to stay under the
  // provider's per-second ceiling. Most weeks pass one clears the list.
  let pending = recipients;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length; attempt++) {
    if (attempt > 1) {
      console.warn(
        `[digest] retry pass ${attempt} for ${pending.length} member(s)`
      );
      await sleep(RETRY_BACKOFF_MS[attempt - 2] ?? 8000);
    }

    const stillPending: string[] = [];
    for (let i = 0; i < pending.length; i += SEND_CONCURRENCY) {
      const batch = pending.slice(i, i + SEND_CONCURRENCY);
      const startedAt = Date.now();
      const results = await Promise.all(
        batch.map(async (email) => {
          const token = await signDigestToken(email);
          return sendWeeklyDigestEmail({
            to: email,
            payload,
            siteUrl: site,
            unsubPageUrl: `${site}/digest/unsubscribe?token=${encodeURIComponent(token)}`,
            unsubPostUrl: `${site}/api/digest/unsubscribe?token=${encodeURIComponent(token)}`,
          });
        })
      );
      for (const [j, r] of results.entries()) {
        if (r.ok) {
          sent++;
        } else {
          stillPending.push(batch[j]);
          lastError.set(batch[j], r.error ?? "send_failed");
        }
      }
      // Hold the batch to its one-second slot. Without this the loop
      // outruns the provider and most of the membership gets 429'd.
      const elapsed = Date.now() - startedAt;
      if (elapsed < BATCH_INTERVAL_MS) {
        await sleep(BATCH_INTERVAL_MS - elapsed);
      }
    }
    pending = stillPending;
  }

  const failed = pending.length;
  for (const email of pending) {
    console.error(`[digest] send failed for ${email}: ${lastError.get(email)}`);
  }
  if (failed) {
    console.error(
      `[digest] ${failed} of ${recipients.length} member(s) unreached after ${MAX_ATTEMPTS} passes`
    );
  }

  // The round leaves the chamber only when it actually reached someone.
  const noteConsumed = !!payload.note && sent > 0;
  if (noteConsumed) {
    await consumeChamberedNote(payload.note!);
  }

  const run: DigestRun = {
    weekKey,
    sentAt: now,
    attempted: recipients.length,
    sent,
    failed,
    unsubSkipped,
    noteConsumed,
  };
  await finishWeeklyRun(run);

  return Response.json({ ok: true, ...run });
}
