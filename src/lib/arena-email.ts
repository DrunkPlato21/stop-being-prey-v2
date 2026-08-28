import {
  FROM_ADDRESS,
  REPLY_TO,
  escapeHtml,
  resendClient,
  type SendResult,
} from "./email";

// The Arena's two outbound emails. Split out of email.ts, which is
// already ~3000 lines, and sharing its sender, its reply-to and its
// escaper rather than forking any of them.
//
// Both are opt-in and both carry RFC 8058 one-click unsubscribe. The
// in-app bell fan-out in arena-notify.ts stays as it was and still
// reaches every member: that is the app, and the consent rule that
// governs here is about the inbox.

/* === A fight is on (to room subscribers) ===================
   The alert the bell could never carry. A bell only reaches someone
   already on the site, which is exactly the member who does not need
   telling that a fight started. Capped to one a day upstream. */

export async function sendArenaLiveNotification(args: {
  to: string;
  boutTitle: string;
  /** The opponent's handle, when the opening tile named one. */
  handle: string | null;
  boutUrl: string;
  unsubUrl: string;
  unsubPostUrl: string;
}): Promise<SendResult> {
  const resend = resendClient();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, arena live notification skipped. Bout: ${args.boutTitle}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  const subject = `A fight is on: ${args.boutTitle}`;
  const against = args.handle
    ? `against ${escapeHtml(args.handle)}`
    : "in the Arena";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>A fight is on</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:36px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:20px;">
                Stop Being Prey &middot; The Arena
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:1.45rem;font-weight:700;line-height:1.25;color:#1a1714;padding-bottom:10px;">
                <a href="${escapeHtml(args.boutUrl)}" style="color:#1a1714;text-decoration:none;">${escapeHtml(args.boutTitle)}</a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:16px;font-style:italic;line-height:1.65;color:#5c544c;padding-bottom:22px;">
                It is happening now, ${against}. The tiles land as they land, and you can watch it get taken apart while it is still going.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:22px;">
                <a href="${escapeHtml(args.boutUrl)}" style="display:inline-block;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;color:#8a7d20;text-decoration:none;border:1px solid #cdbd8a;padding:11px 20px;">
                  Watch it live &rarr;
                </a>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:12px;line-height:1.6;color:#a89e90;border-top:1px solid #e2d9c1;padding-top:16px;">
                You asked the Arena to tell you when a fight starts. At most one of these a day.
                <a href="${escapeHtml(args.unsubUrl)}" style="color:#8a8077;">Stop these</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `A fight is on: ${args.boutTitle}`,
    args.handle ? `Against ${args.handle}.` : "",
    "",
    "It is happening now. Watch it live:",
    args.boutUrl,
    "",
    `Stop these emails: ${args.unsubUrl}`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

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
      console.error("[email] Resend rejected arena live notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw on arena live notification:", {
      to: args.to,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}

/* === The case is filed (to that bout's followers) ==========
   Not a broadcast. This reaches only members who read the fight while
   it was open and asked to be told how it ended, so it can assume they
   already know what it is about. Everyone else meets the case in the
   Sunday digest, which is why the sealed moment does not get a list-wide
   email of its own. */

export async function sendArenaSealedNotification(args: {
  to: string;
  boutTitle: string;
  caseNo: number | null;
  /** Clay's one-line letter-voice opener from the seal form. */
  dispatch: string | null;
  tileCount: number;
  boutUrl: string;
  unsubUrl: string;
  unsubPostUrl: string;
}): Promise<SendResult> {
  const resend = resendClient();
  if (!resend) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[email] RESEND_API_KEY not set, arena sealed notification skipped. Bout: ${args.boutTitle}`
      );
    }
    return { ok: false, error: "email_not_configured" };
  }

  // A follower gets this whether or not the fight earned a number, so both
  // the chip and the subject have to be true in either state. "The case is
  // on file" was a fair fallback when the only unnumbered seals were
  // accidents; now that filing off the record is a deliberate outcome it
  // would announce a case file Clay decided against.
  const numbered = args.caseNo != null;
  const stamp = numbered
    ? `Case No. ${String(args.caseNo).padStart(3, "0")}`
    : "Sealed";
  const headline = numbered
    ? `${stamp} is on file: ${args.boutTitle}`
    : `The bout is sealed: ${args.boutTitle}`;
  const subject = headline;
  const rounds = `${args.tileCount} ${args.tileCount === 1 ? "round" : "rounds"}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>The case is filed</title>
  </head>
  <body style="margin:0;padding:0;background:#f5efe1;font-family:Georgia,'Times New Roman',serif;color:#1a1714;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efe1;padding:48px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fbf6e9;border:1px solid #c9bfa3;padding:36px 32px;">
            <tr>
              <td style="text-align:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;color:#8a7d20;font-weight:700;padding-bottom:20px;">
                Stop Being Prey &middot; Filed
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:8px;">
                <span style="display:inline-block;font-family:ui-monospace,Consolas,monospace;font-size:11px;letter-spacing:0.06em;color:#8a7d20;border:1px solid #cdbd8a;background:#f3ecd8;padding:5px 9px;">${escapeHtml(stamp.toUpperCase())}</span>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:1.45rem;font-weight:700;line-height:1.25;color:#1a1714;padding-bottom:12px;">
                <a href="${escapeHtml(args.boutUrl)}" style="color:#1a1714;text-decoration:none;">${escapeHtml(args.boutTitle)}</a>
              </td>
            </tr>
            ${
              args.dispatch
                ? `<tr>
              <td style="padding-bottom:18px;">
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-left:2px solid #8a7d20;width:100%;">
                  <tr><td style="font-family:Georgia,serif;font-size:16px;font-style:italic;line-height:1.65;color:#3d3530;padding:2px 0 2px 16px;">${escapeHtml(args.dispatch)}</td></tr>
                </table>
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding-bottom:22px;">
                <a href="${escapeHtml(args.boutUrl)}" style="display:inline-block;font-family:'Cormorant Garamond',Georgia,serif;font-size:0.72rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:700;color:#8a7d20;text-decoration:none;border:1px solid #cdbd8a;padding:11px 20px;">
                  Read the case &rarr;
                </a>
                <span style="font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#a89e90;padding-left:12px;">${rounds}, sealed</span>
              </td>
            </tr>
            <tr>
              <td style="font-family:Georgia,serif;font-size:12px;line-height:1.6;color:#a89e90;border-top:1px solid #e2d9c1;padding-top:16px;">
                You followed this fight while it was open, so you get the verdict.
                <a href="${escapeHtml(args.unsubUrl)}" style="color:#8a8077;">Stop Arena email</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    headline,
    args.dispatch ?? "",
    "",
    `${rounds}, sealed. Read the case:`,
    args.boutUrl,
    "",
    `Stop Arena email: ${args.unsubUrl}`,
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

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
      console.error("[email] Resend rejected arena sealed notification:", {
        to: args.to,
        error: result.error,
      });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    console.error("[email] Resend threw on arena sealed notification:", {
      to: args.to,
      error: err,
    });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send_failed",
    };
  }
}
