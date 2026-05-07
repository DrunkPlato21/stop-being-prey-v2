import { Resend } from "resend";

// Resend wrapper. Single transactional sender. Verified domain lives at
// readsowell.com per the user's existing setup. Email content is plain
// HTML with a matching plain-text fallback.

const FROM_ADDRESS = "Stop Being Prey <clay@readsowell.com>";
const REPLY_TO = "clay@readsowell.com";

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
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
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
                <p style="margin:0 0 18px 0;font-style:italic;">a sign-in link, valid for 15 minutes.</p>
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
    "a sign-in link, valid for 15 minutes:",
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
