import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getLoungeReactors } from "@/lib/lounge";
import { resolveReactorNames } from "@/lib/reactor-names";

// GET /api/lounge/reactors?kind=post|reply&targetId=<id>
// Returns who reacted to a Lounge post or reply, with display names, for
// the "see who reacted" popover. Member-only.

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  const kind = req.nextUrl.searchParams.get("kind");
  const targetId = req.nextUrl.searchParams.get("targetId") ?? "";
  if ((kind !== "post" && kind !== "reply") || !targetId) {
    return Response.json({ error: "invalid_target" }, { status: 400 });
  }

  const reactors = await resolveReactorNames(
    await getLoungeReactors({ kind, id: targetId })
  );
  return Response.json({ ok: true, reactors });
}
