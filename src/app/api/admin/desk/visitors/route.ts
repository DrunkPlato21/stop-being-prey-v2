import type { NextRequest } from "next/server";
import { listRecentVisitorsEnriched } from "@/lib/desk-visits";

// Recent /desk visitors for the admin panel. Gated by proxy.ts via
// HTTP Basic auth on /api/admin/*.
//
// GET ?window=30 -> { ok, visitors, totalCount, windowMinutes, generatedAt }
// Window is clamped to [1, 1440] minutes. Default 30. Visitor list
// is capped to the 20 most recent; totalCount reflects the full
// window so the UI can render a "+N more" footer.

export const runtime = "nodejs";

const DEFAULT_WINDOW_MINUTES = 30;
const MIN_WINDOW_MINUTES = 1;
const MAX_WINDOW_MINUTES = 24 * 60;
const VISITOR_LIMIT = 20;

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
  const { visitors, totalCount } = await listRecentVisitorsEnriched(
    sinceMs,
    { limit: VISITOR_LIMIT, now }
  );
  return Response.json({
    ok: true,
    visitors,
    totalCount,
    windowMinutes,
    generatedAt: now,
  });
}
