import { FROM_ADDRESS, resendClient } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

// Plain-text alert to ADMIN_EMAIL when something breaks unattended.
//
// Every past outage here was silent: the Sunday digest reached 40 of
// 171 members three weeks running and the cron still came back green
// (Aug 2026), failed sign-in links went nowhere for months. A
// console.error lands in Vercel logs nobody reads. This puts it in
// Clay's inbox instead.
//
// Never throws: an alert that fails must not take the caller down with
// it. `dedupeKey` holds repeats of the same alert to one per window so
// a stuck cron can't flood the inbox.

const DEDUPE_WINDOW_SECONDS = 6 * 60 * 60;

export async function alertAdmin(args: {
  subject: string;
  lines: string[];
  dedupeKey?: string;
}): Promise<void> {
  try {
    const to = process.env.ADMIN_EMAIL;
    const resend = resendClient();
    if (!to || !resend) {
      console.error(`[alert] not sent (no ADMIN_EMAIL or Resend): ${args.subject}`);
      return;
    }
    if (args.dedupeKey) {
      const gate = await rateLimit(
        `alert:${args.dedupeKey}`,
        1,
        DEDUPE_WINDOW_SECONDS
      );
      if (!gate.ok) return;
    }
    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `[SBP alert] ${args.subject}`,
      text: args.lines.join("\n"),
    });
  } catch (err) {
    console.error(`[alert] send threw for "${args.subject}":`, err);
  }
}

/**
 * Wrap a cron handler so an uncaught throw emails Clay and comes back
 * as a 500 (which shows red in Vercel's cron view) instead of dying in
 * the logs.
 */
export function withCronAlert<A extends unknown[]>(
  name: string,
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      const message = err instanceof Error ? err.stack ?? err.message : String(err);
      console.error(`[cron/${name}] threw:`, err);
      await alertAdmin({
        subject: `Cron "${name}" crashed`,
        lines: [
          `The ${name} cron threw before finishing.`,
          ``,
          message,
        ],
        dedupeKey: `cron-throw:${name}`,
      });
      return new Response(`${name} failed.`, { status: 500 });
    }
  };
}
