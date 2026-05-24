import type { NextRequest } from "next/server";
import {
  addWireLine,
  isWatchFeedConfigured,
  listWireLines,
  removeWireLine,
} from "@/lib/watch-feed";

// Admin management for custom Wire lines — host-authored one-liners
// that scroll in the Watch Feed ticker. Gated by proxy.ts via HTTP
// Basic auth on /api/admin/*.
//   GET    → { ok, lines }
//   POST   → { text } → { ok, lines }   add a line
//   DELETE → { id }   → { ok, lines }   remove a line

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWatchFeedConfigured()) {
    return Response.json({ ok: true, lines: [] });
  }
  const lines = await listWireLines();
  return Response.json({ ok: true, lines });
}

export async function POST(req: NextRequest) {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const text = (payload as { text?: unknown })?.text;
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "missing_text" }, { status: 400 });
  }
  const lines = await addWireLine(text);
  return Response.json({ ok: true, lines });
}

export async function DELETE(req: NextRequest) {
  if (!isWatchFeedConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const id = (payload as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }
  const lines = await removeWireLine(id);
  return Response.json({ ok: true, lines });
}
