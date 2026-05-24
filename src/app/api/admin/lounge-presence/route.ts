import type { NextRequest } from "next/server";
import {
  getRoomPresence,
  getRoomPresenceFloor,
  isLoungeConfigured,
  setRoomPresenceFloor,
} from "@/lib/lounge";

// Admin control for the lounge "who's in the room" indicator. Gated by
// proxy.ts via HTTP Basic auth on /api/admin/*.
//   GET  → { ok, floor, liveTotal }
//          floor: members must be in the room before the line shows;
//          liveTotal: how many are in the room right now (the honest
//          number, shown to the admin regardless of the floor).
//   POST → { floor: number } → { ok, floor }
//
// "Auto by threshold": there's no on/off switch. The line shows itself
// to members once the room reaches the floor and hides below it, so a
// thin turnout never leaks. Raise the floor past any plausible turnout
// to keep it dark.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminEmail(): string {
  return process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? "";
}

export async function GET() {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }
  const [floor, presence] = await Promise.all([
    getRoomPresenceFloor(),
    getRoomPresence({ viewerEmail: adminEmail() }),
  ]);
  return Response.json({ ok: true, floor, liveTotal: presence.total });
}

export async function POST(req: NextRequest) {
  if (!isLoungeConfigured()) {
    return Response.json({ error: "storage_unavailable" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const rawFloor = (payload as { floor?: unknown })?.floor;
  const parsed =
    typeof rawFloor === "number"
      ? rawFloor
      : typeof rawFloor === "string"
        ? Number.parseInt(rawFloor, 10)
        : NaN;
  if (!Number.isFinite(parsed)) {
    return Response.json({ error: "invalid_floor" }, { status: 400 });
  }

  const floor = await setRoomPresenceFloor(parsed);
  return Response.json({ ok: true, floor });
}
