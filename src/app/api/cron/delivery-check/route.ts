import type { NextRequest } from "next/server";
import { getMember } from "@/lib/members";
import {
  claimDeliveryId,
  recordSignInFailure,
} from "@/lib/signin-failures";

// GET /api/cron/delivery-check  (daily, vercel.json)
//
// Resend accepts a send and only later decides it can't be delivered:
// a hard bounce, a typo'd domain, or an address it suppresses because
// the reader once hit "report spam". None of that comes back to us, so a
// paying member could go weeks receiving nothing, sign-in links included
// (fowlergriffin@yahoo.com, suppressed since a spam complaint, asked for
// three links in September and got none). This reads the last few days
// of sends back from Resend and logs every undeliverable one onto the
// sign-in failures list, once per email.
//
// Read-only against Resend; writes only the failures log. Guarded by
// CRON_SECRET like the other crons.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
// Three days covers a missed run. ?days=N (max 30, what Resend keeps)
// is for a one-off backfill by hand with the same Bearer secret.
const DEFAULT_LOOKBACK_DAYS = 3;
const BAD_EVENTS = new Set(["bounced", "suppressed", "complained", "failed"]);
const MAX_PAGES = 60;

type ResendListItem = {
  id: string;
  to: string[] | string;
  subject: string;
  created_at: string;
  last_event: string;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not configured.", { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return new Response("RESEND_API_KEY is not configured.", { status: 500 });
  }

  const days = Math.min(
    30,
    Math.max(1, Number(req.nextUrl.searchParams.get("days")) || DEFAULT_LOOKBACK_DAYS)
  );
  const cutoff = Date.now() - days * DAY_MS;
  let after: string | null = null;
  let scanned = 0;
  let logged = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://api.resend.com/emails");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[cron/delivery-check] Resend list ${res.status}`);
      break;
    }
    const body = (await res.json()) as {
      data: ResendListItem[];
      has_more?: boolean;
    };

    let reachedCutoff = false;
    for (const e of body.data) {
      const at = Date.parse(e.created_at);
      if (at < cutoff) {
        reachedCutoff = true;
        break;
      }
      scanned++;
      if (!BAD_EVENTS.has(e.last_event)) continue;
      if (!(await claimDeliveryId(e.id))) continue;

      const to = String(Array.isArray(e.to) ? e.to[0] : e.to).toLowerCase();
      const member = await getMember(to).catch(() => null);
      await recordSignInFailure({
        kind: "undeliverable",
        email: to,
        at,
        detail:
          `${e.last_event}: "${e.subject}"` +
          (member ? `, ${member.status} member` : ", not a member"),
      });
      logged++;
    }

    if (reachedCutoff || !body.has_more || body.data.length === 0) break;
    after = body.data[body.data.length - 1].id;
  }

  return Response.json({ ok: true, days, scanned, logged });
}
