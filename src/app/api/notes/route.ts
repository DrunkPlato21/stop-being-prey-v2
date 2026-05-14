import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, isAdmin } from "@/lib/comments";
import {
  createNote,
  isNotesConfigured,
  listByMember,
} from "@/lib/notes";

// Member-facing notes endpoint.
//   POST /api/notes  — submit a note (signed-in members only)
//   GET  /api/notes  — list THIS member's own notes (signed-in only)

export const runtime = "nodejs";

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function POST(req: NextRequest) {
  if (!isNotesConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (isAdmin(session.email)) {
    return Response.json({ error: "admin_self_post" }, { status: 400 });
  }

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

  // Snapshot the display name from the comments profile so the
  // admin queue shows a name even after later profile edits.
  const profile = await getProfile(session.email).catch(() => null);
  const displayName =
    profile?.displayName ||
    session.email.split("@")[0] ||
    session.email;

  // Visibility is forced to "public" — the toggle was removed; every
  // note lands on the public Quick Notes board. The createNote lib
  // also forces this server-side so any stale client can't post a
  // private note.
  const result = await createNote({
    email: session.email,
    displayName,
    body: rawBody,
    visibility: "public",
  });
  if (!result.ok) {
    const status = result.error === "storage_unavailable" ? 503 : 400;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true, note: result.note });
}

export async function GET() {
  if (!isNotesConfigured()) {
    return Response.json({ notes: [] });
  }
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }
  const notes = await listByMember(session.email);
  return Response.json({ notes });
}
