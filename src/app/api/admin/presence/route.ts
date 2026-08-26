import type { NextRequest } from "next/server";
import { listPresenceSnapshot, summarizeBySection } from "@/lib/presence";
import { describePresence } from "@/lib/presence-labels";

// GET /api/admin/presence?window=5
//
// Snapshot of who's on the site in the last `window` minutes.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.
//
// Window is clamped to [1, 1440]. Default 5. Returns entries
// (one per member, newest first) plus a per-section count
// summary for the breakdown panel.

export const runtime = "nodejs";

const DEFAULT_WINDOW_MINUTES = 5;
const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = 24 * 60;

function parseWindow(raw: string | null): number {
  if (!raw) return DEFAULT_WINDOW_MINUTES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_MINUTES;
  return Math.min(MAX_WINDOW_MINUTES, Math.max(MIN_WINDOW_MINUTES, n));
}

export async function GET(req: NextRequest) {
  const windowMinutes = parseWindow(req.nextUrl.searchParams.get("window"));
  const now = Date.now();
  const sinceMs = now - windowMinutes * 60 * 1000;
  const entries = await describePresence(
    await listPresenceSnapshot(sinceMs, now)
  );
  const sections = summarizeBySection(entries);
  return Response.json({
    ok: true,
    entries,
    sections,
    windowMinutes,
    generatedAt: now,
  });
}
