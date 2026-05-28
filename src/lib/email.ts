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

/* === Payment failed (membership renewal) ============================
   Sent to the member when Stripe reports invoice.payment_failed.
   Too important for in-site only — a churning card needs a real
   inbox prompt. */

export async function sendPaymentFailedEmail(args: {
  to: string;
  memberDisplayName: string;
  billingUrl: string;
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
  const subject = "Payment didn't go through.";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Payment didn&apos;t go through</title>
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
                <p style="margin:0 0 16px 0;">Your latest membership payment didn&apos;t go through. Usually it&apos;s a card that expired or got reissued.</p>
                <p style="margin:0 0 22px 0;">Update your card and the renewal will retry automatically. If you locked a founder rate, that rate stays locked as long as the subscription stays alive.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 0 24px 0;">
                <a href="${escapeHtml(args.billingUrl)}" style="display:inline-block;background:#1a1714;color:#f5efe1;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;padding:14px 28px;border:1px solid #1a1714;">
                  Update your card
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
    "Your latest membership payment didn't go through. Usually it's a card that expired or got reissued.",
    "",
    "Update your card and the renewal will retry automatically. If you locked a founder rate, that rate stays locked as long as the subscription stays alive.",
    "",
    `Update your card: ${args.billingUrl}`,
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
