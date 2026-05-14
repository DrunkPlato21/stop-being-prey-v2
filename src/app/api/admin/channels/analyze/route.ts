import type { NextRequest } from "next/server";
import {
  analyzeScreenshot,
  isAnalyzeConfigured,
} from "@/lib/screenshot-analyze";

// AI-assisted analysis of a pasted/uploaded social post screenshot.
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.
//
// POST { image: "data:image/png;base64,..." }
//   → { ok: true, suggestion, usage }
//   → { ok: false, error, detail?, retryAfterSeconds? }
//
// Hard cap on the request body so a misbehaving client can't pin the
// server with a 50 MB paste. The body is rejected at JSON parse time
// if it's bigger than the platform allows (typically 4-5 MB on
// Vercel); the explicit length check below is an extra belt before
// any decoding.

export const runtime = "nodejs";
export const maxDuration = 35; // seconds — gives the 30s Anthropic call headroom

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!isAnalyzeConfigured()) {
    return Response.json(
      { ok: false, error: "ai_unavailable" },
      { status: 503 }
    );
  }

  const lengthHeader = req.headers.get("content-length");
  if (lengthHeader) {
    const declared = Number.parseInt(lengthHeader, 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return Response.json(
        { ok: false, error: "image_too_large" },
        { status: 413 }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid_body" },
      { status: 400 }
    );
  }

  const image = (body as { image?: unknown })?.image;
  if (typeof image !== "string" || image.length === 0) {
    return Response.json(
      { ok: false, error: "invalid_image" },
      { status: 400 }
    );
  }

  const result = await analyzeScreenshot(image);
  if (!result.ok) {
    const status =
      result.error === "rate_limited"
        ? 429
        : result.error === "ai_unavailable"
          ? 503
          : result.error === "ai_timeout"
            ? 504
            : result.error === "image_too_large"
              ? 413
              : result.error === "invalid_image"
                ? 400
                : 502;
    return Response.json(result, { status });
  }
  return Response.json(result);
}
