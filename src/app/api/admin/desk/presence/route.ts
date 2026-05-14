import type { NextRequest } from "next/server";
import {
  derivePresenceState,
  isDeskConfigured,
  setAwayNote,
  setSession,
} from "@/lib/desk";

// Toggle Clay's "at the desk" session + manage the away note.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.
//
// POST { action: "start" }                — start a fresh session
// POST { action: "end", awayNote?: string } — end session, optional goodbye
// PUT  { awayNote: string }               — edit/clear note while offline
//
// All variants return { ok, presence, state }.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isDeskConfigured()) {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = (body as { action?: unknown })?.action;
  if (action !== "start" && action !== "end") {
    return Response.json({ error: "invalid_action" }, { status: 400 });
  }

  const rawNote = (body as { awayNote?: unknown })?.awayNote;
  const note =
    typeof rawNote === "string" && action === "end" ? rawNote : undefined;

  const presence = await setSession(action, note);
  return Response.json({
    ok: true,
    presence,
    state: derivePresenceState(presence),
  });
}

export async function PUT(req: NextRequest) {
  if (!isDeskConfigured()) {
    return Response.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawNote = (body as { awayNote?: unknown })?.awayNote;
  if (typeof rawNote !== "string") {
    return Response.json({ error: "missing_note" }, { status: 400 });
  }

  const presence = await setAwayNote(rawNote);
  return Response.json({
    ok: true,
    presence,
    state: derivePresenceState(presence),
  });
}
