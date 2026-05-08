import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  getProfile,
  updateDisplayName,
  updateNotifyPreference,
} from "@/lib/comments";

// GET  /api/profile — current member's profile (or null)
// POST /api/profile — partial update. Body may carry `displayName`
//                     and/or `notifyOnReply`. Each provided field is
//                     applied independently. Display-name updates
//                     additionally rewrite all past comments by this
//                     email (handled inside updateDisplayName).

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const profile = await getProfile(session.email);
  return NextResponse.json({ profile });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const obj = (payload ?? {}) as Record<string, unknown>;
  const displayName = obj.displayName;
  const notifyOnReply = obj.notifyOnReply;

  const wantsName = typeof displayName === "string";
  const wantsToggle = typeof notifyOnReply === "boolean";

  if (!wantsName && !wantsToggle) {
    return NextResponse.json(
      { error: "no_fields_to_update" },
      { status: 400 }
    );
  }

  let updatedComments = 0;

  if (wantsName) {
    if ((displayName as string).trim().length === 0) {
      return NextResponse.json(
        { error: "display_name_required" },
        { status: 400 }
      );
    }
    const r = await updateDisplayName(session.email, displayName as string);
    if (!r.ok) {
      const status =
        r.error === "invalid_display_name"
          ? 400
          : r.error === "storage_unavailable"
            ? 503
            : 400;
      return NextResponse.json({ error: r.error }, { status });
    }
    updatedComments = r.updatedComments;
  }

  if (wantsToggle) {
    const r = await updateNotifyPreference(
      session.email,
      notifyOnReply as boolean
    );
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 503 });
    }
  }

  const finalProfile = await getProfile(session.email);
  return NextResponse.json({
    profile: finalProfile,
    updatedComments,
  });
}
