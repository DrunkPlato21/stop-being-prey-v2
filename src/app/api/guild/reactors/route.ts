import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getGuildReactors } from "@/lib/guild";
import { resolveReactorNames } from "@/lib/reactor-names";

// GET /api/guild/reactors?targetId=<thread|reply id>
// Returns who reacted to a Guild target, with display names, for the
// "see who reacted" popover. Member-only (the room isn't public).

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authenticated" }, { status: 401 });
  }

  const targetId = req.nextUrl.searchParams.get("targetId") ?? "";
  if (!targetId) {
    return Response.json({ error: "missing_target" }, { status: 400 });
  }

  const reactors = await resolveReactorNames(await getGuildReactors(targetId));
  return Response.json({ ok: true, reactors });
}
