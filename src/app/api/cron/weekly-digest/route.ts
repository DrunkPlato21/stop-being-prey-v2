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

// Resend tolerates modest parallelism; five at a time keeps 159
// members to a ~10s run without tripping rate limits.
const SEND_CONCURRENCY = 5;

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
  let failed = 0;

  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const batch = recipients.slice(i, i + SEND_CONCURRENCY);
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
      if (r.ok) sent++;
      else {
        failed++;
        console.error(
          `[digest] send failed for ${batch[j]}: ${r.error}`
        );
      }
    }
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
