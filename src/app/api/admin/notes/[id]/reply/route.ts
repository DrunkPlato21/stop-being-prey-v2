import type { NextRequest } from "next/server";
import { getNote, isNotesConfigured, markReplyEmailed, setReply } from "@/lib/notes";
import { createNotification } from "@/lib/notifications";
import { sendNoteReply } from "@/lib/email";
import { baseUrl } from "@/lib/membership";

// POST /api/admin/notes/[id]/reply  body: { body }
// Persists Clay's reply, flips status to "replied", then emails the
// member. Email is the delivery channel that actually reaches people:
// the bell only works for members who sign in, and a member who just
// canceled (or never signs in) would otherwise never see the reply.
// The reply is persisted first — a failed send must not eat the reply —
// and the response reports email: "sent" | "skipped" | "failed" so the
// admin UI can surface a failed send instead of implying delivery.
// Editing a reply re-sends only when the text actually changed.

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isNotesConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawBody = (body as { body?: unknown })?.body;
  if (typeof rawBody !== "string") {
    return Response.json({ error: "missing_body" }, { status: 400 });
  }


  const result = await setReply(id, rawBody);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return Response.json({ error: result.error }, { status });
  }

  // In-site notification to the note author. Notes are now uniformly
  // private (the public Quick Notes board was retired in 2026-05),
  // so the old "only-fire-for-public" branch is gone — every reply
  // pings the member who wrote the note. Best-effort write.
  const replied = result.note;
  if (replied.fromEmail) {
    const bodyExcerpt =
      rawBody.length > 60 ? `${rawBody.slice(0, 60).trim()}…` : rawBody;
    await createNotification({
      memberEmail: replied.fromEmail,
      type: "reply",
      title: "Clay replied to your note",
      body: bodyExcerpt,
      linkUrl: "/desk",
    }).catch((err) => {
      console.error(
        `[notifications] reply write failed for note ${id}:`,
        err
      );
    });
  }

  // Email the member the reply itself. The full text goes in the
  // email body, so delivery doesn't depend on the member being able
  // to sign back in.
  // Send when the text changed OR the current text was never
  // successfully emailed (a failed send stays retryable by
  // resubmitting the same reply).
  let email: "sent" | "skipped" | "failed" = "skipped";
  if (replied.fromEmail && !replied.replyEmailedAt) {
    const send = await sendNoteReply({
      to: replied.fromEmail,
      memberName: replied.fromName,
      reply: replied.clayReply ?? "",
      originalNote: replied.body,
      visibility: replied.visibility,
      notesUrl: `${baseUrl()}/desk`,
    });
    email = send.ok ? "sent" : "failed";
    if (send.ok) await markReplyEmailed(id);
  }

  return Response.json({ ok: true, note: result.note, email });
}

// Optional helper for "preview the email" — not strictly needed but
// useful when iterating on copy. Keeps the route file small without
// adding a separate file.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ note });
}
