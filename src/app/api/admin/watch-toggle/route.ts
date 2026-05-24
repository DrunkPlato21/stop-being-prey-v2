import type { NextRequest } from "next/server";
import {
  isWatchFeedConfigured,
  isWatchFeedEnabled,
  setWatchFeedEnabled,
} from "@/lib/watch-feed";

// Admin on/off switch for showing the Watch Feed on the live lounge.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.
//   GET  → { ok, enabled }
//   POST → { enabled: boolean } → { ok, enabled }
//
// Off by default. Members only see the Watch Feed (Wire + Billboard +
// arrivals) while this is on.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWatchFeedConfigured()) {
    return Response.json({ ok: true, enabled: false });
  }
  const enabled = await isWatchFeedEnabled();
  return Response.json({ ok: true, enabled });
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
  const raw = (payload as { enabled?: unknown })?.enabled;
  if (typeof raw !== "boolean") {
    return Response.json({ error: "invalid_enabled" }, { status: 400 });
  }
  const enabled = await setWatchFeedEnabled(raw);
  return Response.json({ ok: true, enabled });
}
