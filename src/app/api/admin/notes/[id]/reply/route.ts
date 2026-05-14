import type { NextRequest } from "next/server";
import { getNote, isNotesConfigured, setReply } from "@/lib/notes";
import { createNotification } from "@/lib/notifications";

// POST /api/admin/notes/[id]/reply  body: { body }
// Persists Clay's reply (posts to the public board), flips status to
// "replied". No email dispatch — the private channel is direct email
// to clay@stopbeingprey.com, separate from this system.

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

  // In-site notification to the note author. Only fires for public
  // notes — private notes are already an email channel and the
  // author doesn't need a duplicate in-site ping. Best-effort write.
  const replied = result.note;
  if (replied.visibility === "public" && replied.fromEmail) {
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

  return Response.json({ ok: true, note: result.note });
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
