import { Resend } from "resend";
import type { WallDonation } from "@/lib/wallDonations";
import { displayName as wallDonationDisplayName } from "@/lib/wallDonations";

// Resend wrapper. Single transactional sender. Verified domain is
// stopbeingprey.com (DKIM + SPF green). Email content is plain HTML
// with a matching plain-text fallback.

const FROM_ADDRESS = "Stop Being Prey <noreply@stopbeingprey.com>";
const REPLY_TO = "clay@stopbeingprey.com";

let cached: Resend | null = null;
function client(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendMagicLink(args: {
  to: string;
  url: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    // Soft-fail in dev when keys aren't set so the page flow can still
    // be exercised. Log the link to the server console so a developer
    // can copy it manually.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, magic link not sent. Link: ${args.url}`
      );
      return { ok: false, error: "email_not_configured" };
    }
    return { ok: false, error: "email_not_configured" };
  }

  // Dev convenience: even when Resend IS configured, print the sign-in
  // link to the server console so a developer can sign in as any test
  // account locally without a real inbox. Never runs in production.
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n[email] (dev) sign-in link for ${args.to}:\n${args.url}\n`
    );
  }

  const subject = "your sign-in link, stop being prey";
  const html = renderMagicLinkHtml(args.url);
  const text = renderMagicLinkText(args.url);

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected magic link send:", {
        to: args.to,
        from: FROM_ADDRESS,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    console.info(
      `[email] magic link sent to ${args.to} (resend id: ${result.data?.id ?? "?"})`
    );
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw while sending magic link:", {
      to: args.to,
      from: FROM_ADDRESS,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/**
 * HTML body for the magic-link email. Inline styles only (every email
 * client mangles externals). Cream background, gold accent, voice
 * matched.
 */
export function renderMagicLinkHtml(url: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Stop Being Prey, sign-in link</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;font-style:italic;">a sign-in link, valid for 24 hours.</p>
                <p style="margin:0 0 28px 0;">click below to access the field notes.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 28px 0;">
                <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  Sign in
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.6;color:#5c544c;padding-bottom:24px;">
                <p style="margin:0 0 8px 0;">if the button doesn't work, paste this into your browser:</p>
                <p style="margin:0;word-break:break-all;color:#8a7d20;font-size:13px;">${escapeHtml(url)}</p>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0 0 6px 0;">if you didn't request this, ignore this email. nothing happens unless you click.</p>
                <p style="margin:14px 0 0 0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderMagicLinkText(url: string): string {
  return [
    "stop being prey, sign-in link",
    "",
    "a sign-in link, valid for 24 hours:",
    url,
    "",
    "if you didn't request this, ignore this email.",
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* === No-membership note ====================================
   Sent when someone asks for a sign-in link and the address resolves
   to no membership. Before this, that request produced total silence:
   the endpoint returns a deliberate silent 200 (so it can't be used to
   probe who is a member) and nothing was sent, so the person sat
   waiting on an email that was never coming. The only way it surfaced
   was a reader tracking down Clay's address to ask.

   This leaks nothing. The note goes only to the address that asked, so
   the sender already knows what they typed. From the outside the
   behaviour is unchanged: anyone who asks gets exactly one email, and
   its contents are only ever visible to whoever controls that inbox.

   It is also a conversion surface, and a good one. Someone asking for
   a sign-in link is trying to get in. The two real cases are "I pay
   under a different address" and "I never actually joined", so the
   note answers both and asks for the reply that resolves the first. */

export async function sendNoMembershipNote(args: {
  to: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, no-membership note not sent to ${args.to}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`\n[email] (dev) no-membership note would go to ${args.to}\n`);
  }

  const subject = "about that sign-in link";
  const html = renderNoMembershipHtml();
  const text = renderNoMembershipText();

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected no-membership note:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    console.info(
      `[email] no-membership note sent to ${args.to} (resend id: ${result.data?.id ?? "?"})`
    );
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw while sending no-membership note:", {
      to: args.to,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

export function renderNoMembershipHtml(): string {
  const patronageUrl = `${getBaseUrl()}/patronage`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Stop Being Prey, about that sign-in link</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;font-style:italic;">you asked for a sign-in link.</p>
                <p style="margin:0 0 18px 0;">I don't have a patronage on file for this address, so there's no link to send you. Rather than leave you waiting on an email that isn't coming, here's what's probably going on.</p>
                <p style="margin:0 0 18px 0;"><strong>If you support the work under a different email</strong>, just reply to this and tell me which one. I'll get you sorted the same day.</p>
                <p style="margin:0 0 28px 0;"><strong>If you haven't joined yet</strong>, that's the other half of it. Patrons read new pieces first, before they go public.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 28px 0;">
                <a href="${escapeHtml(patronageUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  See what's inside
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0 0 6px 0;">if you didn't ask for a sign-in link, someone typed this address by mistake. nothing happened, and you can ignore this.</p>
                <p style="margin:14px 0 0 0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderNoMembershipText(): string {
  return [
    "stop being prey, about that sign-in link",
    "",
    "you asked for a sign-in link.",
    "",
    "I don't have a patronage on file for this address, so there's no",
    "link to send you. Rather than leave you waiting on an email that",
    "isn't coming, here's what's probably going on.",
    "",
    "If you support the work under a different email, just reply to this",
    "and tell me which one. I'll get you sorted the same day.",
    "",
    "If you haven't joined yet, that's the other half of it. Patrons read",
    "new pieces first, before they go public.",
    "",
    `${getBaseUrl()}/patronage`,
    "",
    "if you didn't ask for a sign-in link, someone typed this address by",
    "mistake. nothing happened, and you can ignore this.",
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");
}

/* === Reply notification ====================================
   Sent to a comment author after Clay posts a reply. Voice and
   visual match the magic-link email so the inbox feels coherent. */

export async function sendReplyNotification(args: {
  to: string;
  recipientDisplayName: string;
  pieceTitle: string;
  pieceUrl: string;
  replyBody: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, reply notification not sent. To: ${args.to}, piece: ${args.pieceTitle}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const subject = `clay replied to your comment on "${args.pieceTitle}"`;
  const html = renderReplyNotificationHtml(args);
  const text = renderReplyNotificationText(args);

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected reply notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw while sending reply notification:", {
      to: args.to,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

function renderReplyNotificationHtml(args: {
  recipientDisplayName: string;
  pieceTitle: string;
  pieceUrl: string;
  replyBody: string;
}): string {
  // Trim and HTML-escape the reply body. Preserve newlines as <br />.
  const replyEscaped = escapeHtml(args.replyBody.trim()).replace(
    /\n/g,
    "<br/>"
  );
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Clay replied to your comment</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">${escapeHtml(args.recipientDisplayName)},</p>
                <p style="margin:0 0 18px 0;">Clay replied to your comment on <em>${escapeHtml(args.pieceTitle)}</em>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 24px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1a1714;">
                      ${replyEscaped}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 24px 0;">
                <a href="${escapeHtml(args.pieceUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  Read on the page
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderReplyNotificationText(args: {
  recipientDisplayName: string;
  pieceTitle: string;
  pieceUrl: string;
  replyBody: string;
}): string {
  return [
    `${args.recipientDisplayName},`,
    "",
    `Clay replied to your comment on "${args.pieceTitle}":`,
    "",
    args.replyBody.trim(),
    "",
    `Read on the page: ${args.pieceUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");
}

/* === Member-to-member thread reply notification ===========
   Sent to a comment author when another member posts a thread reply
   under their comment. Same visual language as the Clay reply email
   but tone shifts to "X said something on your comment" — we're not
   pretending it's from Clay. */

export async function sendCommentThreadReplyNotification(args: {
  to: string;
  recipientDisplayName: string;
  replyAuthorDisplayName: string;
  pieceTitle: string;
  pieceUrl: string;
  replyBody: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, thread reply notification not sent. To: ${args.to}, piece: ${args.pieceTitle}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const subject = `${args.replyAuthorDisplayName} replied to your comment on "${args.pieceTitle}"`;
  const replyEscaped = escapeHtml(args.replyBody.trim()).replace(/\n/g, "<br/>");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>New reply to your comment</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">${escapeHtml(args.recipientDisplayName)},</p>
                <p style="margin:0 0 18px 0;"><strong style="color:#1a1714;">${escapeHtml(args.replyAuthorDisplayName)}</strong> replied to your comment on <em>${escapeHtml(args.pieceTitle)}</em>.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 24px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1a1714;">
                      ${replyEscaped}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 24px 0;">
                <a href="${escapeHtml(args.pieceUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  Read on the page
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0 0 6px 0;">to stop these emails, toggle off &ldquo;email me when someone replies&rdquo; in your account.</p>
                <p style="margin:14px 0 0 0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${args.recipientDisplayName},`,
    "",
    `${args.replyAuthorDisplayName} replied to your comment on "${args.pieceTitle}":`,
    "",
    args.replyBody.trim(),
    "",
    `Read on the page: ${args.pieceUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected thread reply notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw on thread reply notification:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/* === Guild reply notification =============================
   Sent to a thread (or reply) author when another member replies in
   the Guild. Same visual language as the comment thread-reply email.
   Batching is enforced upstream (one email per thread per window).

   HARD-GUARDED to production: Guild replies are frequent and recipients
   include local test accounts, so this email never sends from dev even
   when Resend is configured. The in-app bell still fires in dev; only
   the mail is withheld. */

export async function sendGuildReplyNotification(args: {
  to: string;
  recipientDisplayName: string;
  replyAuthorDisplayName: string;
  threadTitle: string;
  /** Path like /guild/<id>#reply-<id>; the absolute URL is built here. */
  threadPath: string;
  replyBody: string;
  /**
   * True when this goes to someone WATCHING the thread rather than the
   * person being answered. Only the copy changes: telling a watcher that
   * someone "replied to your thread" would be a lie, and the way to stop
   * these is a different lever than the account toggle.
   */
  watching?: boolean;
}): Promise<SendResult> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[email] (dev) guild reply email SKIPPED -> ${args.to} re "${args.threadTitle}"`
    );
    return { ok: false, error: "skipped_in_dev" };
  }

  const resend = client();
  if (!resend) return { ok: false, error: "email_not_configured" };

  const threadUrl = `${getBaseUrl()}${args.threadPath}`;
  const greeting = args.recipientDisplayName
    ? escapeHtml(args.recipientDisplayName)
    : "Hey";
  const subject = args.watching
    ? `${args.replyAuthorDisplayName} replied in "${args.threadTitle}"`
    : `${args.replyAuthorDisplayName} replied to your thread in the Guild`;
  const lede = args.watching
    ? `<strong style="color:#1a1714;">${escapeHtml(args.replyAuthorDisplayName)}</strong> replied in <em>${escapeHtml(args.threadTitle)}</em>, a thread you're following.`
    : `<strong style="color:#1a1714;">${escapeHtml(args.replyAuthorDisplayName)}</strong> replied to your thread <em>${escapeHtml(args.threadTitle)}</em>.`;
  // Watchers opted in by taking part, so the way out is the thread's own
  // Watching control, not the account-wide reply toggle.
  const footerNote = args.watching
    ? "to stop these, open the thread and click &ldquo;watching&rdquo;."
    : "to stop these emails, toggle off &ldquo;email me when someone replies&rdquo; in your account.";
  const replyEscaped = escapeHtml(args.replyBody.trim()).replace(/\n/g, "<br/>");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>New reply in the Guild</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey &middot; The Guild
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">${greeting},</p>
                <p style="margin:0 0 18px 0;">${lede}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 24px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1a1714;">
                      ${replyEscaped}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 24px 0;">
                <a href="${escapeHtml(threadUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  Read it in the Guild
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0 0 6px 0;">${footerNote}</p>
                <p style="margin:14px 0 0 0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${args.recipientDisplayName || "Hey"},`,
    "",
    args.watching
      ? `${args.replyAuthorDisplayName} replied in "${args.threadTitle}", a thread you're following:`
      : `${args.replyAuthorDisplayName} replied to your thread "${args.threadTitle}":`,
    "",
    args.replyBody.trim(),
    "",
    `Read it in the Guild: ${threadUrl}`,
    "",
    args.watching
      ? 'to stop these, open the thread and click "watching".'
      : 'to stop these emails, toggle off "email me when someone replies" in your account.',
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected guild reply notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw on guild reply notification:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/* === Pending-comment notification (to admin) ==============
   Sent to ADMIN_EMAIL when a member posts a new comment, so Clay
   doesn't need to poll /admin/comments. Quiet, plain, transactional. */

export async function sendPendingCommentNotification(args: {
  to: string;
  authorDisplayName: string;
  authorEmail: string;
  pieceTitle: string;
  pieceUrl: string;
  queueUrl: string;
  body: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, pending-comment notification skipped. From: ${args.authorEmail}, piece: ${args.pieceTitle}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const subject = `new comment from ${args.authorDisplayName} on "${args.pieceTitle}"`;
  const bodyEscaped = escapeHtml(args.body.trim()).replace(/\n/g, "<br/>");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>New comment pending</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:36px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:20px;">
                Stop Being Prey · Queue
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 14px 0;"><strong style="color:#1a1714;">${escapeHtml(args.authorDisplayName)}</strong> <span style="color:#8a8077;font-style:italic;">(${escapeHtml(args.authorEmail)})</span></p>
                <p style="margin:0 0 18px 0;color:#5c544c;">on <em>${escapeHtml(args.pieceTitle)}</em></p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 24px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:#1a1714;">
                      ${bodyEscaped}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 12px 0;">
                <a href="${escapeHtml(args.queueUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:12px 24px;border:1px solid #1a1714;">
                  Review queue
                </a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 0 20px 0;">
                <a href="${escapeHtml(args.pieceUrl)}" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:500;color:#5c544c;text-decoration:none;">
                  Open in context
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `New comment from ${args.authorDisplayName} (${args.authorEmail})`,
    `On: ${args.pieceTitle}`,
    "",
    args.body.trim(),
    "",
    `Review queue: ${args.queueUrl}`,
    `Open in context: ${args.pieceUrl}`,
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected pending-comment notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw on pending-comment notification:", {
      to: args.to,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/* === Wall donation notification (to admin) ================
   Sent to ADMIN_EMAIL when a new wall donation enters the moderation
   queue. Plain text — admin-facing, not member-facing. */

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function formatMoneyDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

export async function notifyNewWallDonation(
  donation: WallDonation,
  wallTitle: string
): Promise<void> {
  const resend = client();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping notification");
    return;
  }
  const to = process.env.ADMIN_EMAIL;
  const from = process.env.EMAIL_FROM;
  if (!to || !from) {
    console.warn(
      "[email] ADMIN_EMAIL or EMAIL_FROM not set — skipping notification"
    );
    return;
  }

  const baseUrl = getBaseUrl();
  const adminUrl = `${baseUrl}/admin/walls`;
  const amount = formatMoneyDollars(donation.amountCents);
  const who = wallDonationDisplayName(donation);

  const subject = `Wall donation pending — ${amount} from ${who}`;
  const text = [
    `New donation pending review on the "${wallTitle}" wall.`,
    ``,
    `Amount:    ${amount}`,
    `From:      ${who}${donation.anonymous ? " (anonymous)" : ""}`,
    `Show amt:  ${donation.showAmount ? "yes" : "no"}`,
    ``,
    `Note:`,
    donation.note,
    ``,
    `Review queue: ${adminUrl}`,
  ].join("\n");

  try {
    await resend.emails.send({
      from,
      to,
      subject,
      text,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    console.error(`[email] failed to send notification: ${reason}`);
  }
}

/* === Note-reply email ===============================================
   Sent to a member when Clay answers a note they left on the desk.
   From clay@stopbeingprey.com directly (not noreply@) so Reply-To
   works without extra setup. */

export async function sendNoteReply(args: {
  to: string;
  memberName: string;
  reply: string;
  originalNote: string;
  visibility: "private" | "public";
  notesUrl: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, note reply not sent. Reply: ${args.reply}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const from = "Clay <clay@stopbeingprey.com>";
  const subject = "Clay replied to your note.";
  const html = renderNoteReplyHtml(args);
  const text = renderNoteReplyText(args);

  try {
    const result = await resend.emails.send({
      from,
      to: args.to,
      subject,
      html,
      text,
      replyTo: "clay@stopbeingprey.com",
    });
    if (result.error) {
      console.error("[email] Resend rejected note-reply send:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw while sending note reply:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

function renderNoteReplyHtml(args: {
  memberName: string;
  reply: string;
  originalNote: string;
  notesUrl: string;
}): string {
  const greeting = args.memberName
    ? `${escapeHtml(args.memberName)},`
    : "Hey,";
  const replyHtml = escapeHtml(args.reply).replace(/\n/g, "<br />");
  const noteHtml = escapeHtml(args.originalNote).replace(/\n/g, "<br />");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Clay replied to your note</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;font-style:italic;">${greeting}</p>
                <p style="margin:0 0 22px 0;">A reply to the note you left on the desk:</p>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#1a1714;border-left:2px solid #8a7d20;padding:4px 18px;background:#f5efe1;">
                ${replyHtml}
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.6;color:#5c544c;padding-top:32px;">
                <p style="margin:0 0 6px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.65rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a8077;font-weight:600;">You left this note</p>
                <p style="margin:0;font-style:italic;color:#5c544c;">${noteHtml}</p>
              </td>
            </tr>
            <tr>
              <td style="padding-top:32px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#3d3530;">
                <p style="margin:0 0 6px 0;font-style:italic;">stay close,</p>
                <p style="margin:0;">~ Clay</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:28px;">
                <a href="${escapeHtml(args.notesUrl)}" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;color:#8a7d20;text-decoration:none;border-bottom:1px solid #b8a82c;padding-bottom:2px;">
                  See your past notes &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderNoteReplyText(args: {
  memberName: string;
  reply: string;
  originalNote: string;
  notesUrl: string;
}): string {
  const greeting = args.memberName ? `${args.memberName},` : "Hey,";
  return [
    greeting,
    "",
    "A reply to the note you left on the desk:",
    "",
    args.reply,
    "",
    "── You left this note ──",
    args.originalNote,
    "",
    "stay close,",
    "~ Clay",
    "",
    `See your past notes: ${args.notesUrl}`,
  ].join("\n");
}

/* === Case Review notifications =====================================
   Sent on checkout.session.completed for paid case reviews.
   sendCaseReviewAdminNotification — full case content to Clay so he
   can work the queue from his inbox (no admin UI in V1).
   sendCaseReviewMemberConfirmation — receipt to the member with the
   5-business-day SLA.

   Both are plain-text first; admin needs greppable, the member email
   is short enough that visual chrome isn't load-bearing. */

export async function sendCaseReviewAdminNotification(args: {
  to: string;
  tier: "free" | "public_review" | "private_review";
  /** $25/$50 for paid tiers; 0 for free. Omitted from subject when 0. */
  amountDollars: number;
  memberDisplayName: string;
  memberEmail: string;
  caseId: string;
  title: string;
  situation: string;
  move: string;
  attemptedResponse: string;
  helpWanted: string;
  anonymization: string | null;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, case-submission admin notification skipped. Case: ${args.caseId}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const tierLabel =
    args.tier === "free"
      ? "FREE"
      : args.tier === "public_review"
        ? "PUBLIC"
        : "PRIVATE";
  const amountSegment =
    args.amountDollars > 0 ? ` - $${args.amountDollars}` : "";
  const subject = `[CASE SUBMISSION - ${tierLabel}]${amountSegment} - ${args.memberDisplayName || args.memberEmail}`;

  const tierLine =
    args.amountDollars > 0
      ? `Tier:      ${tierLabel} ($${args.amountDollars})`
      : `Tier:      ${tierLabel} (no charge)`;
  const slaLine =
    args.tier === "free"
      ? `SLA: free tier, no guaranteed turnaround.`
      : `SLA: 2 business days from now.`;
  const text = [
    `New ${tierLabel.toLowerCase()} case submission.`,
    ``,
    `Member:    ${args.memberDisplayName || "(no display name)"} <${args.memberEmail}>`,
    tierLine,
    args.anonymization
      ? `Anonymization: ${args.anonymization}`
      : `Anonymization: (n/a, private)`,
    `Case ID:   ${args.caseId}`,
    ``,
    `── Title ──`,
    args.title,
    ``,
    `── The situation ──`,
    args.situation,
    ``,
    `── The move ──`,
    args.move,
    ``,
    `── What they tried ──`,
    args.attemptedResponse || "(none provided)",
    ``,
    `── What they want help with ──`,
    args.helpWanted || "(none provided)",
    ``,
    slaLine,
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      text,
      replyTo: args.memberEmail,
    });
    if (result.error) {
      console.error("[email] Resend rejected case-review admin notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error(
      "[email] Resend threw on case-review admin notification:",
      err
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

export async function sendCaseReviewMemberConfirmation(args: {
  to: string;
  memberDisplayName: string;
  tier: "free" | "public_review" | "private_review";
  title: string;
  caseFilesUrl: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, case-review member confirmation skipped. To: ${args.to}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const tierLabel =
    args.tier === "free"
      ? "Free"
      : args.tier === "public_review"
        ? "Public Review"
        : "Private Review";
  const slaLine =
    args.tier === "free"
      ? "Clay will read it. The best free submissions become Case Files; review isn&apos;t guaranteed."
      : "Clay will respond within 2 business days. The dissection lands in your inbox.";
  const slaLineText =
    args.tier === "free"
      ? "Clay will read it. The best free submissions become Case Files; review isn't guaranteed."
      : "Clay will respond within 2 business days. The dissection lands in your inbox.";
  const refundLineHtml =
    args.tier === "free"
      ? ""
      : `<p style="margin:0 0 18px 0;font-size:14px;color:#5c544c;">Full refund within 48 hours if work hasn&apos;t started. Pro-rated if Clay has begun the dissection. Email <a href="mailto:clay@stopbeingprey.com" style="color:#8a7d20;">clay@stopbeingprey.com</a> to request.</p>`;
  const refundLineText =
    args.tier === "free"
      ? ""
      : "Refund policy: full refund within 48 hours if work hasn't started. Pro-rated if Clay has begun. Email clay@stopbeingprey.com to request.";
  const subject = "Your case is in.";
  const greeting = args.memberDisplayName
    ? `${escapeHtml(args.memberDisplayName)},`
    : "Hey,";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Your case is in.</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey &middot; Case Files
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;font-style:italic;">${greeting}</p>
                <p style="margin:0 0 14px 0;">Your case is in.</p>
                <p style="margin:0 0 14px 0;color:#5c544c;"><em>${escapeHtml(tierLabel)} &middot; &ldquo;${escapeHtml(args.title)}&rdquo;</em></p>
                <p style="margin:0 0 18px 0;">${slaLine}</p>
                ${refundLineHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 12px 0;">
                <a href="${escapeHtml(args.caseFilesUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:12px 24px;border:1px solid #1a1714;">
                  Back to Case Files
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;margin-top:24px;">
                <p style="margin:0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    args.memberDisplayName ? `${args.memberDisplayName},` : "Hey,",
    "",
    "Your case is in.",
    `${tierLabel} - "${args.title}"`,
    "",
    slaLineText,
    ...(refundLineText ? ["", refundLineText] : []),
    "",
    "stay close,",
    "~ Clay",
    "",
    `Back to Case Files: ${args.caseFilesUrl}`,
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error(
        "[email] Resend rejected case-review member confirmation:",
        { to: args.to, error: result.error }
      );
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error(
      "[email] Resend threw on case-review member confirmation:",
      err
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/* === Gift membership (pay it forward) ===============================
   Five sends across the gift lifecycle. Copy is PLACEHOLDER; Clay
   finalizes in his voice. Framing is pay-it-forward, never "gift card".

   sendGiftEmail               -> recipient: someone bought you a seat
   sendGiftClaimedEmail        -> buyer: your gift was claimed
   sendGiftAlreadyMemberEmail  -> buyer: recipient already had a seat
   sendGiftSelfRefundEmail     -> buyer: you gifted yourself, refunded
   sendGiftExpiryReminderEmail -> recipient: term ending, keep your seat */

/** Shared shell so the five gift emails stay visually coherent with
    the magic-link template without repeating the table scaffolding. */
function renderGiftShell(bodyRowsHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Stop Being Prey</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            ${bodyRowsHtml}
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function giftButtonRow(url: string, label: string): string {
  return `<tr>
              <td align="center" style="padding:8px 0 28px 0;">
                <a href="${escapeHtml(url)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  ${escapeHtml(label)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.6;color:#5c544c;padding-bottom:24px;">
                <p style="margin:0 0 8px 0;">if the button doesn't work, paste this into your browser:</p>
                <p style="margin:0;word-break:break-all;color:#8a7d20;font-size:13px;">${escapeHtml(url)}</p>
              </td>
            </tr>`;
}

async function sendGiftLifecycleEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  logTag: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, ${args.logTag} skipped. To: ${args.to}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }
  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error(`[email] Resend rejected ${args.logTag}:`, {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error(`[email] Resend threw on ${args.logTag}:`, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

export async function sendGiftEmail(args: {
  to: string;
  buyerName: string;
  message: string | null;
  termLabel: string;
  redeemUrl: string;
}): Promise<SendResult> {
  // Dev convenience, same as the magic link: print the redemption link
  // so a developer can walk the flow without a real inbox.
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n[email] (dev) gift redemption link for ${args.to}:\n${args.redeemUrl}\n`
    );
  }

  const subject = `${args.buyerName} bought you a seat inside Stop Being Prey`;
  const messageRow = args.message
    ? `<tr>
              <td style="padding:8px 0 24px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;font-style:italic;color:#1a1714;">
                      ${escapeHtml(args.message).replace(/\n/g, "<br/>")}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
    : "";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;"><strong style="color:#1a1714;">${escapeHtml(args.buyerName)}</strong> paid it forward. They bought you ${escapeHtml(args.termLabel)} inside Stop Being Prey. The comments, the Writer's Desk, the lounge, all of it.</p>
                <p style="margin:0 0 18px 0;">no card, no charge, no strings. someone wanted you in the room.</p>
              </td>
            </tr>
            ${messageRow}
            ${giftButtonRow(args.redeemUrl, "Take your seat")}`);
  const text = [
    `${args.buyerName} paid it forward. They bought you ${args.termLabel} inside Stop Being Prey.`,
    "",
    ...(args.message ? [`Their note: "${args.message}"`, ""] : []),
    "no card, no charge, no strings. someone wanted you in the room.",
    "",
    `Take your seat: ${args.redeemUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "gift email",
  });
}

export async function sendGiftClaimedEmail(args: {
  to: string;
  recipientEmail: string;
  termLabel: string;
}): Promise<SendResult> {
  const subject = "your gift was claimed";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:24px;">
                <p style="margin:0 0 18px 0;">the seat you bought for <strong style="color:#1a1714;">${escapeHtml(args.recipientEmail)}</strong> was just claimed. they're in the room for ${escapeHtml(args.termLabel)}.</p>
                <p style="margin:0;">thank you for putting someone in it. this place runs on exactly that.</p>
              </td>
            </tr>`);
  const text = [
    `the seat you bought for ${args.recipientEmail} was just claimed. they're in the room for ${args.termLabel}.`,
    "",
    "thank you for putting someone in it. this place runs on exactly that.",
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "gift claimed email",
  });
}

export async function sendGiftAlreadyMemberEmail(args: {
  to: string;
  recipientEmail: string;
  redeemUrl: string;
}): Promise<SendResult> {
  const subject = "about the seat you bought";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">good news and a small wrinkle. <strong style="color:#1a1714;">${escapeHtml(args.recipientEmail)}</strong> already has a seat in the room. they beat you to it.</p>
                <p style="margin:0 0 18px 0;">your gift is not wasted. it's still live, and either of you can pass it to someone else from the link below. pick the next person who needs to be in here.</p>
              </td>
            </tr>
            ${giftButtonRow(args.redeemUrl, "Pass it on")}`);
  const text = [
    `good news and a small wrinkle. ${args.recipientEmail} already has a seat in the room. they beat you to it.`,
    "",
    "your gift is not wasted. it's still live, and either of you can pass it to someone else from the link below.",
    "",
    `Pass it on: ${args.redeemUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "gift already-member email",
  });
}

export async function sendGiftSelfRefundEmail(args: {
  to: string;
  membershipUrl: string;
  refunded: boolean;
}): Promise<SendResult> {
  const subject = "that seat was for someone else";
  const refundLineHtml = args.refunded
    ? `<p style="margin:0 0 18px 0;">your payment was refunded in full. nothing owed, nothing kept.</p>`
    : `<p style="margin:0 0 18px 0;">your refund is being processed. if it doesn't land within a few days, reply to this email.</p>`;
  const refundLineText = args.refunded
    ? "your payment was refunded in full. nothing owed, nothing kept."
    : "your refund is being processed. if it doesn't land within a few days, reply to this email.";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">the gift seat you bought was addressed to your own email. gifts are for putting someone else in the room, so I can't hand it back to you.</p>
                ${refundLineHtml}
                <p style="margin:0 0 18px 0;">want a seat of your own? that door is always open.</p>
              </td>
            </tr>
            ${giftButtonRow(args.membershipUrl, "Become a member")}`);
  const text = [
    "the gift seat you bought was addressed to your own email. gifts are for putting someone else in the room, so I can't hand it back to you.",
    "",
    refundLineText,
    "",
    `want a seat of your own? ${args.membershipUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "gift self-refund email",
  });
}

export async function sendGiftExpiryReminderEmail(args: {
  to: string;
  expiresAtLabel: string;
  membershipUrl: string;
}): Promise<SendResult> {
  const subject = "your seat is almost up";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">someone paid it forward and put you in this room. that seat runs out on <strong style="color:#1a1714;">${escapeHtml(args.expiresAtLabel)}</strong>.</p>
                <p style="margin:0 0 18px 0;">if the room has been worth it, keep your seat on your own terms. pay what it's worth, cancel anytime. and someday, maybe, put the next person in.</p>
              </td>
            </tr>
            ${giftButtonRow(args.membershipUrl, "Keep your seat")}`);
  const text = [
    `someone paid it forward and put you in this room. that seat runs out on ${args.expiresAtLabel}.`,
    "",
    "if the room has been worth it, keep your seat on your own terms. pay what it's worth, cancel anytime.",
    "",
    `Keep your seat: ${args.membershipUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "gift expiry reminder",
  });
}

/* === Community Seat Pool ============================================
   The anonymous pay-it-forward lane. Reuses the gift shell + button.
   Givers and claimers never see each other, so neither email names the
   other side. Chain framing throughout: "someone covered you, pay it
   forward when you can" — never donation/charity.

   ALL COPY BELOW IS DRAFT. Clay finalizes the voice. (No em dashes.)

   sendPoolFundThankYouEmail  -> giver: you funded a seat for someone
   sendPoolContributionThankYouEmail -> giver: your chip-in landed in the pot
   sendPoolSeatClaimedEmail   -> giver: a seat you funded was just claimed
   sendPoolClaimConfirmEmail  -> claimer: confirm to claim your seat
   sendPoolWelcomeEmail       -> claimer: someone covered you, you're in */

export async function sendPoolFundThankYouEmail(args: {
  to: string;
  termLabel: string;
  /** Seats funded in this payment (default 1). */
  seats?: number;
}): Promise<SendResult> {
  // DRAFT copy — Clay finalizes.
  const seats = args.seats && args.seats > 1 ? args.seats : 1;
  const subject = seats > 1 ? `you funded ${seats} seats` : "you funded a seat";
  const lead =
    seats > 1
      ? `you just funded ${seats} seats for people who couldn't swing it. ${escapeHtml(
          args.termLabel
        )} in the room each, no questions asked of them, no names on any side.`
      : `you just funded a seat for someone who couldn't swing it. ${escapeHtml(
          args.termLabel
        )} in the room, no questions asked of them, no names on either side.`;
  const leadText =
    seats > 1
      ? `you just funded ${seats} seats for people who couldn't swing it. ${args.termLabel} in the room each, no questions asked of them, no names on any side.`
      : `you just funded a seat for someone who couldn't swing it. ${args.termLabel} in the room, no questions asked of them, no names on either side.`;
  const tail =
    seats > 1
      ? "they go to whoever's waiting, or wait in the pool until the right people find them. either way, you put people in here who wouldn't be otherwise. thank you."
      : "they may claim it today or it may wait in the pool until the right person finds it. either way, you put someone in here who wouldn't be otherwise. thank you.";

  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:24px;">
                <p style="margin:0 0 18px 0;">${lead}</p>
                <p style="margin:0;">${tail}</p>
              </td>
            </tr>`);
  const text = [leadText, "", tail, "", "stay close,", "~ Clay"].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool fund thank-you",
  });
}

export async function sendPoolContributionThankYouEmail(args: {
  to: string;
  amountCents: number;
  /** Whole seats this chip-in tipped the pot over into (0 = moved the bar). */
  seatsMinted: number;
  /** Cents left in the pot after any seats minted. */
  potCents: number;
  seatPriceCents: number;
}): Promise<SendResult> {
  // DRAFT copy — Clay finalizes.
  const money = (cents: number) =>
    cents % 100 === 0
      ? `$${cents / 100}`
      : `$${(cents / 100).toFixed(2)}`;
  const gave = money(args.amountCents);
  const remaining = Math.max(0, args.seatPriceCents - args.potCents);
  const minted = args.seatsMinted > 0;

  const lead = minted
    ? args.seatsMinted === 1
      ? `your ${gave} tipped the pot over. a whole seat just dropped into the pool for someone who couldn't swing it, no names on any side.`
      : `your ${gave} tipped the pot over. ${args.seatsMinted} whole seats just dropped into the pool for people who couldn't swing it, no names on any side.`
    : `your ${gave} is in the pot. it pools with other readers until it funds a whole seat, then that seat goes to someone who couldn't swing it.`;
  const tail = minted
    ? `thank you for making the room bigger. the pot's already ${money(
        remaining
      )} from the next one.`
    : `you moved the bar. the pot's ${money(
        remaining
      )} from the next seat. thank you for the push.`;

  const subject = minted ? "you funded a seat" : "thanks for chipping in";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:24px;">
                <p style="margin:0 0 18px 0;">${lead}</p>
                <p style="margin:0;">${tail}</p>
              </td>
            </tr>`);
  const text = [lead, "", tail, "", "stay close,", "~ Clay"].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool contribution thank-you",
  });
}

export async function sendPoolSeatClaimedEmail(args: {
  to: string;
  termLabel: string;
}): Promise<SendResult> {
  // Loop-closer: the giver funded a seat days ago; now someone took it.
  // Anonymous both ways, so this NEVER names or hints at the claimer.
  // DRAFT copy — Clay finalizes.
  const subject = "a seat you funded was claimed";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:24px;">
                <p style="margin:0 0 18px 0;">the seat you funded was just claimed. someone's in the room for ${escapeHtml(
                  args.termLabel
                )} because you put it there.</p>
                <p style="margin:0;">you'll never know who, and they'll never know you. that's the design. thank you for making a place for them.</p>
              </td>
            </tr>`);
  const text = [
    `the seat you funded was just claimed. someone's in the room for ${args.termLabel} because you put it there.`,
    "",
    "you'll never know who, and they'll never know you. that's the design. thank you for making a place for them.",
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool seat claimed",
  });
}

export async function sendPoolClaimConfirmEmail(args: {
  to: string;
  confirmUrl: string;
}): Promise<SendResult> {
  // Dev convenience, same as the magic link: print the confirm link so
  // a developer can walk the flow without a real inbox.
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n[email] (dev) pool claim confirm link for ${args.to}:\n${args.confirmUrl}\n`
    );
  }

  // DRAFT copy — Clay finalizes.
  const subject = "confirm your seat";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">you asked for a way into Stop Being Prey. confirm it's you and your seat is claimed, if one's open, or your place in line is held until the next one is funded.</p>
                <p style="margin:0 0 18px 0;">no proof, no explaining yourself. one tap below.</p>
              </td>
            </tr>
            ${giftButtonRow(args.confirmUrl, "Confirm my seat")}`);
  const text = [
    "you asked for a way into Stop Being Prey. confirm it's you and your seat is claimed, if one's open, or your place in line is held until the next one is funded.",
    "",
    "no proof, no explaining yourself. one tap below.",
    "",
    `Confirm my seat: ${args.confirmUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool claim confirm",
  });
}

/**
 * The one nudge for a seat request that never got confirmed.
 *
 * Someone asked for a way in and then stalled on a single click, which
 * left them invisible to the waitlist while funded seats went past them
 * to people who asked later. The link inside is live: the cron restarts
 * the confirm window as it sends, so this is never a second dead token.
 *
 * Deliberately does not mention seats going by. They asked for help;
 * telling them what their delay cost is the last thing they need.
 */
export async function sendPoolConfirmNudgeEmail(args: {
  to: string;
  confirmUrl: string;
}): Promise<SendResult> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n[email] (dev) pool confirm NUDGE link for ${args.to}:\n${args.confirmUrl}\n`
    );
  }

  // DRAFT copy — Clay finalizes.
  const subject = "your seat is still waiting";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">you asked for a seat a few days back and never confirmed it. that's the only thing standing between you and the room.</p>
                <p style="margin:0 0 18px 0;">nothing has expired and nothing is owed. one tap and you're either in, or held in line for the next seat someone funds.</p>
              </td>
            </tr>
            ${giftButtonRow(args.confirmUrl, "Confirm my seat")}`);
  const text = [
    "you asked for a seat a few days back and never confirmed it. that's the only thing standing between you and the room.",
    "",
    "nothing has expired and nothing is owed. one tap and you're either in, or held in line for the next seat someone funds.",
    "",
    `Confirm my seat: ${args.confirmUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool confirm nudge",
  });
}

export async function sendPoolWelcomeEmail(args: {
  to: string;
  termLabel: string;
  signInUrl: string;
}): Promise<SendResult> {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `\n[email] (dev) pool welcome sign-in link for ${args.to}:\n${args.signInUrl}\n`
    );
  }

  // DRAFT copy — Clay finalizes.
  const subject = "someone covered your seat";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">a reader covered your seat. you're in for ${escapeHtml(args.termLabel)}. the comments, the Writer's Desk, the lounge, all of it. no card, no charge.</p>
                <p style="margin:0 0 18px 0;">you don't owe anyone anything. but when you're able, put the next person in. that's the whole idea. nobody's a charity case here, everybody's a link.</p>
              </td>
            </tr>
            ${giftButtonRow(args.signInUrl, "Step inside")}`);
  const text = [
    `a reader covered your seat. you're in for ${args.termLabel}. the comments, the Writer's Desk, the lounge, all of it. no card, no charge.`,
    "",
    "you don't owe anyone anything. but when you're able, put the next person in. that's the whole idea. nobody's a charity case here, everybody's a link.",
    "",
    `Step inside: ${args.signInUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool welcome",
  });
}

export async function sendPoolWaitlistEmail(args: {
  to: string;
}): Promise<SendResult> {
  // DRAFT copy — Clay finalizes.
  const subject = "you're in line";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:24px;">
                <p style="margin:0 0 18px 0;">you're in line for a seat. there isn't one free this second, but every seat is funded by another reader, and the moment the next one lands, it's yours.</p>
                <p style="margin:0;">we'll email you the instant it opens. nothing more to do, and no need to ask again.</p>
              </td>
            </tr>`);
  const text = [
    "you're in line for a seat. there isn't one free this second, but every seat is funded by another reader, and the moment the next one lands, it's yours.",
    "",
    "we'll email you the instant it opens. nothing more to do, and no need to ask again.",
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool waitlist",
  });
}

export async function sendPoolExpiryReminderEmail(args: {
  to: string;
  expiresAtLabel: string;
  membershipUrl: string;
}): Promise<SendResult> {
  // DRAFT copy — Clay finalizes. Chain framing, not "renew or lose it".
  const subject = "your seat is almost up";
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;">a reader covered your seat in this room. that seat runs out on <strong style="color:#1a1714;">${escapeHtml(args.expiresAtLabel)}</strong>.</p>
                <p style="margin:0 0 18px 0;">if the room has been worth it, keep it going on your own terms. pay what it's worth, cancel anytime. and someday, when you're able, cover the next person the way someone covered you.</p>
              </td>
            </tr>
            ${giftButtonRow(args.membershipUrl, "Keep your seat")}`);
  const text = [
    `a reader covered your seat in this room. that seat runs out on ${args.expiresAtLabel}.`,
    "",
    "if the room has been worth it, keep it going on your own terms. pay what it's worth, cancel anytime. and someday, when you're able, cover the next person the way someone covered you.",
    "",
    `Keep your seat: ${args.membershipUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "pool expiry reminder",
  });
}

// Admin alert: a member left a note on the Writer's Desk. Goes to Clay so
// he's reached even when the Desk Alert tray app isn't running. Reuses
// the gift shell for visual consistency. (Not member-facing — copy here
// is functional, not voiced.)
export async function sendDeskNoteAdminEmail(args: {
  to: string;
  fromName: string;
  body: string;
  notesUrl: string;
}): Promise<SendResult> {
  const subject = `New desk note from ${args.fromName}`;
  const quoted = escapeHtml(args.body).replace(/\n/g, "<br/>");
  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;"><strong style="color:#1a1714;">${escapeHtml(args.fromName)}</strong> left a note on your desk:</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;">
                  <tr>
                    <td style="padding:14px 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;font-style:italic;color:#1a1714;">
                      ${quoted}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${giftButtonRow(args.notesUrl, "Open your notes")}`);
  const text = [
    `${args.fromName} left a note on your desk:`,
    "",
    `"${args.body}"`,
    "",
    `Open your notes: ${args.notesUrl}`,
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "desk note admin alert",
  });
}

/* === Payment failed (membership renewal) ============================
   Sent to the member when Stripe reports invoice.payment_failed.
   Too important for in-site only — a churning card needs a real
   inbox prompt.

   Stripe fires this event on every retry in its dunning window, so the
   stage comes from lib/dunning.ts and the copy escalates with it. The
   member sees at most three of these per failed renewal, and the last
   one is the only place we ever say the seat is closing. */

type PaymentFailedCopy = {
  subject: string;
  paragraphs: string[];
  cta: string;
};

function paymentFailedCopy(
  stage: "first" | "nudge" | "final",
  nextAttemptLabel: string | null
): PaymentFailedCopy {
  if (stage === "first") {
    return {
      subject: "Payment didn't go through.",
      paragraphs: [
        "Your latest membership payment didn't go through. Usually it's a card that expired or got reissued.",
        "Update your card and the renewal will retry automatically. If you locked a founder rate, that rate stays locked as long as the subscription stays alive.",
      ],
      cta: "Update your card",
    };
  }

  if (stage === "nudge") {
    return {
      subject: "Your card is still failing.",
      paragraphs: [
        "Your membership payment still hasn't cleared. The bank has turned it down a few times now, so it's probably not a fluke.",
        nextAttemptLabel
          ? `Nothing is lost yet. The next attempt runs ${nextAttemptLabel}. Update the card before then and it goes through, at the same rate you locked.`
          : "Nothing is lost yet. Update the card and the next attempt goes through, at the same rate you locked.",
        "If you'd rather step away, you don't have to do anything. It closes on its own. I'd just rather you stayed.",
      ],
      cta: "Update your card",
    };
  }

  return {
    subject: "Last try on your seat.",
    paragraphs: [
      "This is the last note you'll get about this one.",
      "Your renewal failed, and there's no automatic retry left. When this closes out, the seat closes with it, and the rate you locked goes with it.",
      "One click puts a new card on and keeps everything exactly where it is.",
      "If you're done, that's alright. No hard feelings, and the writing stays free to read. I just didn't want your seat to lapse quietly without telling you.",
    ],
    cta: "Keep your seat",
  };
}

export async function sendPaymentFailedEmail(args: {
  to: string;
  memberDisplayName: string;
  billingUrl: string;
  stage: "first" | "nudge" | "final";
  nextAttemptLabel?: string | null;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, payment-failed email skipped. To: ${args.to}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const greeting = args.memberDisplayName
    ? `${escapeHtml(args.memberDisplayName)},`
    : "Hey,";
  const copy = paymentFailedCopy(args.stage, args.nextAttemptLabel ?? null);
  const subject = copy.subject;
  const paragraphsHtml = copy.paragraphs
    .map(
      (p, i) =>
        `<p style="margin:0 0 ${
          i === copy.paragraphs.length - 1 ? 22 : 16
        }px 0;">${escapeHtml(p)}</p>`
    )
    .join("\n                ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;font-style:italic;">${greeting}</p>
                ${paragraphsHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 24px 0;">
                <a href="${escapeHtml(args.billingUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  ${escapeHtml(copy.cta)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    args.memberDisplayName ? `${args.memberDisplayName},` : "Hey,",
    "",
    ...copy.paragraphs.flatMap((p) => [p, ""]),
    `${copy.cta}: ${args.billingUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
    });
    if (result.error) {
      console.error("[email] Resend rejected payment-failed:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw on payment-failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/* === Membership lapsed (win-back) ===================================
   The subscription actually died after Stripe ran out of retries.
   Until now this moment was silent, which is a strange way to treat
   somebody who paid for months. The one thing worth saying is that
   their locked rate survives on the existing Stripe customer, so
   coming back through /reactivate costs what it always cost. */

export async function sendMembershipLapsedEmail(args: {
  to: string;
  memberDisplayName: string;
  reactivateUrl: string;
}): Promise<SendResult> {
  const greeting = args.memberDisplayName
    ? `${escapeHtml(args.memberDisplayName)},`
    : "Hey,";
  const paragraphs = [
    "The card never cleared, so your membership ended today. No more attempts, nothing pending.",
    "Here's the part worth knowing. Your rate is still yours. Come back through the link below and you return at the exact price you locked, founder or charter number intact. It does not reset to whatever the seats cost now.",
    "No rush, and no pitch. The door just stays open.",
  ];

  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:8px;">
                <p style="margin:0 0 18px 0;font-style:italic;">${greeting}</p>
                ${paragraphs
                  .map(
                    (p, i) =>
                      `<p style="margin:0 0 ${
                        i === paragraphs.length - 1 ? 22 : 16
                      }px 0;">${escapeHtml(p)}</p>`
                  )
                  .join("\n                ")}
              </td>
            </tr>
            ${giftButtonRow(args.reactivateUrl, "Reactivate your seat")}`);

  const text = [
    args.memberDisplayName ? `${args.memberDisplayName},` : "Hey,",
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    `Reactivate your seat: ${args.reactivateUrl}`,
    "",
    "stay close,",
    "~ Clay",
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject: "Your seat closed.",
    html,
    text,
    logTag: "membership lapsed",
  });
}

/* === Billing alert (to Clay) ========================================
   Fires twice per failed renewal: the day the card first fails, and
   the day Stripe burns its last retry. Those are the two windows where
   a personal note from a human still turns a churn around. Everything
   in between stays silent so this doesn't become inbox noise. */

export async function sendBillingAdminAlert(args: {
  to: string;
  stage: "first" | "final";
  memberEmail: string;
  memberName: string;
  tierLabel: string;
  amountLabel: string;
  memberSinceLabel: string;
  attemptCount: number;
  nextAttemptLabel: string | null;
  stripeCustomerId: string;
}): Promise<SendResult> {
  const who = args.memberName || args.memberEmail;
  const subject =
    args.stage === "first"
      ? `[billing] ${who} (${args.tierLabel}) card failed`
      : `[billing] last retry burned: ${who} (${args.tierLabel})`;

  const lead =
    args.stage === "first"
      ? "First failure today. The automated notice has gone out. This is the window where a personal note actually works."
      : "Stripe has no retry left. The final notice has gone out. After this the seat closes and the locked rate goes with it.";

  const facts: Array<[string, string]> = [
    ["member", `${who} <${args.memberEmail}>`],
    ["standing", `${args.tierLabel}, ${args.amountLabel}`],
    ["member since", args.memberSinceLabel],
    ["attempts", String(args.attemptCount)],
    ["next retry", args.nextAttemptLabel ?? "none, this was the last"],
  ];

  const stripeUrl = `https://dashboard.stripe.com/customers/${args.stripeCustomerId}`;
  const mailto = `mailto:${args.memberEmail}`;

  const rowsHtml = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:3px 14px 3px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.68rem;letter-spacing:0.18em;text-transform:uppercase;color:#8a7d20;white-space:nowrap;vertical-align:top;">${escapeHtml(
          label
        )}</td><td style="padding:3px 0;font-family:Georgia,serif;font-size:15px;color:#1a1714;">${escapeHtml(
          value
        )}</td></tr>`
    )
    .join("");

  const html = renderGiftShell(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3530;padding-bottom:18px;">
                <p style="margin:0;">${escapeHtml(lead)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 24px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;background:#f5efe1;width:100%;">
                  <tr><td style="padding:14px 18px;"><table role="presentation" cellspacing="0" cellpadding="0">${rowsHtml}</table></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:15px;line-height:1.7;color:#5c544c;padding-bottom:24px;">
                <p style="margin:0;"><a href="${escapeHtml(
                  mailto
                )}" style="color:#8a7d20;">Write to them</a> &nbsp;·&nbsp; <a href="${escapeHtml(
    stripeUrl
  )}" style="color:#8a7d20;">Open in Stripe</a></p>
              </td>
            </tr>`);

  const text = [
    lead,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    `Write to them: ${args.memberEmail}`,
    `Open in Stripe: ${stripeUrl}`,
  ].join("\n");

  return sendGiftLifecycleEmail({
    to: args.to,
    subject,
    html,
    text,
    logTag: "billing admin alert",
  });
}

/* === Weekly digest ==================================================
   The patron report. One email a week to every active member, fired by
   /api/cron/weekly-digest. Supporter-first by design: about half the
   membership never signs in, so this email IS the room for them. Every
   content section is optional; the assembly lib guarantees a floor
   (archive rotation) so the email is never empty. The digest observes,
   it never demands — a silent week still sends whole.

   ALL COPY BELOW IS DRAFT. Clay finalizes the voice. (No em dashes.)

   Ships with RFC 8058 one-click unsubscribe headers plus a footer
   link, per the house rule: no new email path without a no-login
   one-click out. */

import type { DigestPayload } from "@/lib/digest";

function digestMoney(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

// Each section opens with a hairline rule + tracked eyebrow, so the
// email reads as a structured report rather than a plain note. The
// rule carries the rhythm; the eyebrow names the section.
function digestSectionEyebrow(label: string): string {
  return `<tr>
              <td style="border-top:1px solid #e2d9c1;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.66rem;letter-spacing:0.28em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding:22px 0 14px 0;">
                ${escapeHtml(label)}
              </td>
            </tr>`;
}

// One entry inside a digest section: a small tracked label (with the
// meta stat folded in, so counts never dangle mid-sentence) over the
// content line in ink. The same eyebrow-over-content rhythm the site
// itself uses — hierarchy, not decoration.
function digestEntry(args: {
  label: string;
  meta?: string;
  bodyHtml: string;
}): string {
  const meta = args.meta
    ? `<span style="font-family:Georgia,serif;font-size:12px;letter-spacing:0.02em;text-transform:none;color:#a89e90;font-weight:400;">&nbsp;&middot;&nbsp; ${escapeHtml(args.meta)}</span>`
    : "";
  return `<tr>
              <td style="padding-bottom:3px;">
                <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:#8a8077;font-weight:700;">${escapeHtml(args.label)}</span>${meta}
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:#1a1714;padding-bottom:16px;">
                ${args.bodyHtml}
              </td>
            </tr>`;
}

export async function sendWeeklyDigestEmail(args: {
  to: string;
  payload: DigestPayload;
  /** Absolute origin (no trailing slash) for turning site-relative
      links into clickable ones. */
  siteUrl: string;
  /** The human unsubscribe page (footer link). */
  unsubPageUrl: string;
  /** The RFC 8058 one-click POST endpoint (mail-client header). */
  unsubPostUrl: string;
}): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, weekly digest skipped. To: ${args.to}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const p = args.payload;
  const abs = (url: string | null): string | null =>
    url ? (url.startsWith("http") ? url : `${args.siteUrl}${url}`) : null;

  const subject = "this week at the desk";
  const dateLabel = new Date(p.generatedAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const rows: string[] = [];
  const textLines: string[] = [];

  // Masthead: title + dateline under the brand row, so the email
  // opens like an issue of something rather than a bare note — and so
  // a lead-less week (no chambered note, empty desk) still opens with
  // structure instead of falling straight into a section eyebrow.
  rows.push(`<tr>
              <td align="center" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.55rem;font-weight:700;color:#1a1714;letter-spacing:-0.01em;padding-bottom:4px;">
                This week at the desk
              </td>
            </tr>
            <tr>
              <td align="center" style="font-family:Georgia,serif;font-size:0.85rem;font-style:italic;color:#8a8077;padding-bottom:22px;">
                ${escapeHtml(dateLabel)}
              </td>
            </tr>`);
  textLines.push("THIS WEEK AT THE DESK", dateLabel, "");

  // Lead: the chambered note when one is loaded. Otherwise proof of
  // work straight off the desk — the status note, or the away note.
  // A patron reading "heads down on the next piece" got exactly what
  // they pay for; that line is the point, not a fallback apology.
  if (p.note) {
    rows.push(`<tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.7;color:#3d3530;padding-bottom:8px;white-space:pre-wrap;">${escapeHtml(p.note)}</td>
            </tr>`);
    textLines.push(p.note, "");
  } else {
    const deskLine = p.desk.statusBody ?? p.desk.awayNote;
    if (deskLine) {
      rows.push(digestSectionEyebrow("From the desk"));
      rows.push(`<tr>
              <td style="padding-bottom:8px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;width:100%;">
                  <tr><td style="font-family:Georgia,serif;font-size:16px;font-style:italic;line-height:1.7;color:#3d3530;padding:4px 0 4px 16px;white-space:pre-wrap;">${escapeHtml(deskLine)}</td></tr>
                </table>
              </td>
            </tr>`);
      textLines.push("FROM THE DESK", deskLine, "");
    }
  }

  if (p.shipped.length > 0) {
    rows.push(digestSectionEyebrow("New work this week"));
    for (const item of p.shipped) {
      const href = abs(item.url);
      const title = href
        ? `<a href="${escapeHtml(href)}" style="color:#1a1714;">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      rows.push(digestEntry({ label: item.label, bodyHtml: title }));
      textLines.push(`${item.label}: ${item.title}${href ? ` (${href})` : ""}`);
    }
    textLines.push("");
  }

  const hasRooms =
    !!p.rooms.qotw || !!p.rooms.latestThread || p.rooms.loungePostsThisWeek > 0;
  if (hasRooms) {
    rows.push(digestSectionEyebrow("The rooms"));
    if (p.rooms.qotw) {
      rows.push(
        digestEntry({
          label: "Question of the week",
          meta: `${p.rooms.qotw.replyCount} ${p.rooms.qotw.replyCount === 1 ? "reply" : "replies"}`,
          bodyHtml: `&ldquo;${escapeHtml(p.rooms.qotw.title)}&rdquo;`,
        })
      );
      textLines.push(
        `Question of the week: "${p.rooms.qotw.title}" (${p.rooms.qotw.replyCount} replies)`
      );
    }
    if (p.rooms.latestThread) {
      rows.push(
        digestEntry({
          label: "Live in the Guild",
          meta: `${p.rooms.latestThread.replyCount} ${p.rooms.latestThread.replyCount === 1 ? "reply" : "replies"}`,
          bodyHtml: `&ldquo;${escapeHtml(p.rooms.latestThread.title)}&rdquo;`,
        })
      );
      textLines.push(
        `Live in the Guild: "${p.rooms.latestThread.title}" (${p.rooms.latestThread.replyCount} replies)`
      );
    }
    if (p.rooms.loungePostsThisWeek > 0) {
      // The Lounge is a stat, not a title — it gets the label row only,
      // with the count as its meta, so it doesn't fake a content line.
      rows.push(`<tr>
              <td style="padding-bottom:16px;">
                <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:#8a8077;font-weight:700;">The Lounge kept talking</span><span style="font-family:Georgia,serif;font-size:12px;color:#a89e90;">&nbsp;&middot;&nbsp; ${p.rooms.loungePostsThisWeek} ${p.rooms.loungePostsThisWeek === 1 ? "post" : "posts"} this week</span>
              </td>
            </tr>`);
      textLines.push(
        `The Lounge kept talking: ${p.rooms.loungePostsThisWeek} ${p.rooms.loungePostsThisWeek === 1 ? "post" : "posts"} this week`
      );
    }
    rows.push(`<tr>
              <td style="font-family:Georgia,serif;font-size:14px;padding:0 0 8px 0;">
                <a href="${escapeHtml(`${args.siteUrl}/guild`)}" style="color:#8a7d20;">Step into the Guild</a>${p.rooms.loungePostsThisWeek > 0 ? ` &nbsp;&middot;&nbsp; <a href="${escapeHtml(`${args.siteUrl}/lounge`)}" style="color:#8a7d20;">The Lounge</a>` : ""}
              </td>
            </tr>`);
    textLines.push(`Step into the Guild: ${args.siteUrl}/guild`, "");
  }

  const patronLines: string[] = [];
  if (p.wall) {
    const wallLine = `The wall &ldquo;${escapeHtml(p.wall.title)}&rdquo; carries ${p.wall.contributorCount} ${p.wall.contributorCount === 1 ? "name" : "names"} and ${digestMoney(p.wall.totalRaisedCents)}.`;
    patronLines.push(
      `${wallLine} <a href="${escapeHtml(`${args.siteUrl}/wall`)}" style="color:#8a7d20;">See it</a>`
    );
    textLines.push(
      `The wall "${p.wall.title}" carries ${p.wall.contributorCount} names and ${digestMoney(p.wall.totalRaisedCents)}. ${args.siteUrl}/wall`
    );
  }
  if (p.pool.waiting > 0) {
    patronLines.push(
      `${p.pool.waiting} ${p.pool.waiting === 1 ? "reader is" : "readers are"} waiting on a covered seat. <a href="${escapeHtml(`${args.siteUrl}/membership/cover`)}" style="color:#8a7d20;">Put one in the room</a>`
    );
    textLines.push(
      `${p.pool.waiting} reader(s) waiting on a covered seat: ${args.siteUrl}/membership/cover`
    );
  }
  if (patronLines.length > 0) {
    rows.push(digestSectionEyebrow("Patronage at work"));
    rows.push(`<tr>
              <td style="font-family:Georgia,serif;font-size:15px;line-height:1.8;color:#3d3530;padding-bottom:8px;">
                ${patronLines.join("<br/>")}
              </td>
            </tr>`);
    textLines.push("");
  }

  if (p.archive) {
    const href = abs(p.archive.url)!;
    rows.push(digestSectionEyebrow("From the case files"));
    rows.push(`<tr>
              <td style="padding-bottom:8px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.35rem;font-weight:700;color:#8a7d20;padding-right:14px;vertical-align:top;line-height:1.3;">&#8470;&nbsp;${p.archive.number}</td>
                    <td style="vertical-align:top;">
                      <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.4;color:#1a1714;"><a href="${escapeHtml(href)}" style="color:#1a1714;">${escapeHtml(p.archive.title)}</a></div>
                      <div style="font-family:Georgia,serif;font-size:12.5px;font-style:italic;color:#8a8077;padding-top:3px;">${escapeHtml(p.archive.archetype)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`);
    textLines.push(
      `From the case files: No. ${p.archive.number}, ${p.archive.title} (${p.archive.archetype}) ${href}`,
      ""
    );
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Stop Being Prey</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:40px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:24px;">
                Stop Being Prey
              </td>
            </tr>
            ${rows.join("\n            ")}
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic;color:#8a8077;line-height:1.6;border-top:1px solid #d8cfb8;padding-top:20px;">
                <p style="margin:0;">stay close,<br/>~ Clay</p>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:12px;color:#a89e90;line-height:1.6;padding-top:20px;">
                <p style="margin:0;">You get this because you hold a seat. <a href="${escapeHtml(args.unsubPageUrl)}" style="color:#a89e90;">Stop the weekly digest</a> and nothing else changes.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  textLines.push(
    "stay close,",
    "~ Clay",
    "",
    `Stop the weekly digest (nothing else changes): ${args.unsubPageUrl}`
  );
  const text = textLines.join("\n");

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: args.to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: {
        "List-Unsubscribe": `<${args.unsubPostUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (result.error) {
      console.error("[email] Resend rejected weekly digest send:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw while sending weekly digest:", {
      to: args.to,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}
