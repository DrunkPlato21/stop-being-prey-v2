import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/comments";
import { transcribeSpecimen } from "@/lib/arena-transcribe";

// POST /api/arena/transcribe  { image: "data:image/webp;base64,..." }
// Clay-only. Runs a pasted specimen screenshot through the vision model
// and returns { handle, transcript, timestamp } for the bench to
// auto-fill. Costs a model call, so it shares the channels admin's
// 10-per-hour budget; the bench treats every failure as "fill it in
// yourself", never as a blocker.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session || !isAdmin(session.email)) {
    return Response.json({ error: "not_authorized" }, { status: 403 });
  }

  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.image !== "string") {
    return Response.json({ error: "missing_image" }, { status: 400 });
  }

  const result = await transcribeSpecimen(body.image);
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.error === "rate_limited" ? 429 : 502 }
    );
  }
  return Response.json({ ok: true, ...result.result });
}
