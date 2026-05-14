import type { NextRequest } from "next/server";
import {
  isNotesConfigured,
  setStatus,
  type NoteStatus,
} from "@/lib/notes";

// PATCH /api/admin/notes/[id]/status  body: { status }
// Allowed status values: read | archived. (Setting replied is a
// side-effect of /reply; setting new is meaningless from the queue.)

export const runtime = "nodejs";

export async function PATCH(
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

  const rawStatus = (body as { status?: unknown })?.status;
  const allowed: NoteStatus[] = ["read", "archived"];
  if (!allowed.includes(rawStatus as NoteStatus)) {
    return Response.json({ error: "invalid_status" }, { status: 400 });
  }

  const next = await setStatus(id, rawStatus as NoteStatus);
  if (!next) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, note: next });
}
