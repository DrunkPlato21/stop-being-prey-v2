import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getBoutVersion } from "@/lib/arena";

// GET /api/arena/pulse?bout=<id>  ->  { v: number }
//
// The heartbeat behind the live bout page. Members watching a fight ask
// this every few seconds; it is ONE Redis read of the bout record and
// returns one number, the version marker that every post, fix, delete
// and seal moves. The page only re-renders itself when that number
// changes, so a room full of people watching a quiet bout costs almost
// nothing, and a room watching a busy one pays for the tiles once per
// change rather than once per tick.
//
// Members only. Anonymous readers never see an open bout, and a filed
// case does not change, so neither has anything to poll for.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "not_authorized" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("bout");
  if (!id) return Response.json({ error: "missing_bout" }, { status: 400 });

  const v = await getBoutVersion(id);
  if (v === null) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json(
    { v },
    { headers: { "Cache-Control": "no-store" } }
  );
}
