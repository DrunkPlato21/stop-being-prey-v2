import type { NextRequest } from "next/server";
import {
  clearChamberedNote,
  getChamberedNote,
  getLastRun,
  nextDigestFireAt,
  setChamberedNote,
} from "@/lib/digest";

// Chamber control for the weekly digest. Gated by proxy.ts via HTTP
// Basic auth on /api/admin/*, like every other admin route.
//
// Always operates on the LIVE chamber ({ prod: true }), even from a dev
// server — chambering a note is admin intent for Sunday's real send,
// never a local test. Same convention as the pool admin.
//
// POST { body: string }  loads (replaces) the one chambered note.
// POST { body: "" }      clears the chamber.
// GET                    current chamber + last run + next fire time.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [chamber, lastRun] = await Promise.all([
    getChamberedNote({ prod: true }),
    getLastRun({ prod: true }),
  ]);
  return Response.json({
    ok: true,
    chamber,
    lastRun,
    nextFireAt: nextDigestFireAt(),
  });
}

export async function POST(req: NextRequest) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = (parsed as { body?: unknown })?.body;
  if (typeof body !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.trim()) {
    await clearChamberedNote({ prod: true });
    return Response.json({ ok: true, chamber: null });
  }

  const result = await setChamberedNote(body, { prod: true });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true, chamber: result.note });
}
