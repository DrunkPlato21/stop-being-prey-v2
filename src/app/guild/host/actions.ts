"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin, isGuildHost } from "@/lib/comments";
import { sendMemberBroadcast } from "@/lib/kit";
import {
  renderMemberNoteBodyHtml,
  sendMemberNotePreview,
} from "@/lib/email";

// Server Actions for the Guild Host panel. Like every action in this app,
// each one re-verifies the session AND the host role inside the function
// body — Server Actions are reachable by direct POST, so authorization can
// never live only in the page. Only the host (or the admin) may reach these.

export type HostNoteState = {
  status: "idle" | "test_sent" | "sent" | "error";
  message?: string;
};

const MAX_SUBJECT = 160;
const MAX_BODY = 8000;

async function requireHost(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  if (!isGuildHost(session.email) && !isAdmin(session.email)) return null;
  return session.email;
}

function readNote(formData: FormData): {
  subject: string;
  body: string;
  error?: string;
} {
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) {
    return { subject, body, error: "Add a subject and a message before sending." };
  }
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) {
    return { subject, body, error: "That's longer than the limit. Trim it down." };
  }
  return { subject, body };
}

// Preview text = the first line of the note, capped. Shows in the inbox
// row beneath the subject on most clients.
function previewFrom(body: string): string {
  const firstLine = body.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return firstLine.slice(0, 140);
}

/**
 * Send the note to the host's own inbox as a content proof. Lets Trish read
 * exactly what she wrote (typos, wording) before it goes wide. Goes via
 * Resend, wrapped in a labelled banner so it can't be mistaken for the real
 * member broadcast (which Kit renders with the newsletter template).
 */
export async function sendTestNoteAction(
  _prev: HostNoteState,
  formData: FormData
): Promise<HostNoteState> {
  const hostEmail = await requireHost();
  if (!hostEmail) return { status: "error", message: "Not authorized." };

  const { subject, body, error } = readNote(formData);
  if (error) return { status: "error", message: error };

  const bodyHtml = renderMemberNoteBodyHtml(body);
  const result = await sendMemberNotePreview({
    to: hostEmail,
    subject: `TEST — ${subject}`,
    bodyHtml,
    banner:
      "This is a test copy, sent only to you. Members have not received anything. When it looks right, use Send to members.",
    logTag: "host note test",
  });

  if (!result.ok) {
    return {
      status: "error",
      message:
        "Couldn't send the test. Email may be misconfigured — tell Clay.",
    };
  }
  return {
    status: "test_sent",
    message: `Test sent to ${hostEmail}. Check your inbox.`,
  };
}

/**
 * The real send. Creates a Kit broadcast targeting the Members tag (paid
 * members only), scheduled a couple of minutes out — Kit handles the
 * template, delivery, and unsubscribe. Then fires a copy to Clay via Resend
 * so he always sees what went out, regardless of Kit tag membership. The
 * Clay copy is best-effort: a hiccup there must not report the member send
 * as failed, because the member send is what actually matters.
 */
export async function sendMemberNoteAction(
  _prev: HostNoteState,
  formData: FormData
): Promise<HostNoteState> {
  const hostEmail = await requireHost();
  if (!hostEmail) return { status: "error", message: "Not authorized." };

  const { subject, body, error } = readNote(formData);
  if (error) return { status: "error", message: error };

  const bodyHtml = renderMemberNoteBodyHtml(body);

  const broadcast = await sendMemberBroadcast({
    subject,
    content: bodyHtml,
    previewText: previewFrom(body),
  });

  if (!broadcast.ok) {
    const detail =
      broadcast.reason === "not_configured"
        ? "The Kit connection isn't set up. Tell Clay."
        : "Kit rejected the send. Nothing went out. Tell Clay.";
    console.error("[host-note] member broadcast failed:", broadcast);
    return { status: "error", message: detail };
  }

  // Copy to Clay — best-effort, never blocks the reported success.
  const adminEmail = process.env.ADMIN_EMAIL ?? "clay@stopbeingprey.com";
  try {
    const profile = await getProfile(hostEmail).catch(() => null);
    const hostName = profile?.displayName?.trim() || "your Guild host";
    await sendMemberNotePreview({
      to: adminEmail,
      subject: `[Members note] ${subject}`,
      bodyHtml,
      banner: `Copy of the note ${hostName} just sent to the paid members via Kit. Members receive it in about 2 minutes.`,
      logTag: "host note admin copy",
    });
  } catch (err) {
    console.error("[host-note] admin copy failed (send still went out):", err);
  }

  return {
    status: "sent",
    message:
      "Sent. It goes out to the members through Kit in about 2 minutes, and a copy is on its way to Clay.",
  };
}
