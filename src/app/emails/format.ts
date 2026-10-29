import type { EmailMeta } from "@/lib/email-archive";

/** Where a row, card or pager link for an email goes: its reading page,
 *  or the essay page when the email carried a published essay. */
export function emailHref(e: Pick<EmailMeta, "slug" | "essay">): string {
  return e.essay ? `/${e.essay.slug}` : `/emails/${e.slug}`;
}

// Date formats for the email archive. Emails are dated in Eastern time,
// the clock Clay sends on, so a late-evening send doesn't roll over to
// the next day the way it would in UTC.

const TZ = "America/New_York";

/** "Wednesday, October 28, 2026" */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  });
}

/** "Oct 28, 2026" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  });
}

/** "October 2026", the index's group heading. */
export function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

/** { day: "28", weekday: "Wed" } for the index's date column. */
export function dayParts(iso: string): { day: string; weekday: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: TZ }),
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }),
  };
}
