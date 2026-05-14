import type { NextRequest } from "next/server";
import {
  isNotesConfigured,
  setReaction,
  type ClayReaction,
} from "@/lib/notes";
import { createNotification } from "@/lib/notifications";

// POST /api/admin/notes/[id]/react  body: { reaction: ClayReaction | null }
// Sets or clears Clay's reaction on a note. Reactions are
// independent of replies and broadcast to the public feed on the
// next polling tick (5–15s).

export const runtime = "nodejs";

const ALLOWED: ClayReaction[] = [
  "heart",
  "thumb",
  "laugh",
  "fire",
  "shock",
];

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

  const raw = (body as { reaction?: unknown })?.reaction;
  let reaction: ClayReaction | null;
  if (raw === null) {
    reaction = null;
  } else if (
    typeof raw === "string" &&
    ALLOWED.includes(raw as ClayReaction)
  ) {
    reaction = raw as ClayReaction;
  } else {
    return Response.json(
      { error: "invalid_reaction" },
      { status: 400 }
    );
  }

  const result = await setReaction(id, reaction);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 503;
    return Response.json({ error: result.error }, { status });
  }

  // Only fire on a reaction *set* (not clear), and only for public
  // notes — private notes don't surface reactions to the author in
  // any meaningful way. Best-effort.
  if (reaction !== null && result.note.visibility === "public" && result.note.fromEmail) {
    const excerpt =
      result.note.body.length > 60
        ? `${result.note.body.slice(0, 60).trim()}…`
        : result.note.body;
    await createNotification({
      memberEmail: result.note.fromEmail,
      type: "reaction",
      title: "Clay reacted to your note",
      body: excerpt,
      linkUrl: "/desk",
    }).catch((err) => {
      console.error(
        `[notifications] reaction write failed for note ${id}:`,
        err
      );
    });
  }

  return Response.json({ ok: true, note: result.note });
}
