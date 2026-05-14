import { NextResponse } from "next/server";
import { updateDisplayName } from "@/lib/comments";

// POST /api/admin/members/:email/rename  body: { displayName }
//
// Admin-gated rename for resolving impersonation / dispute cases.
// Lives under /api/admin/* so it inherits the proxy's HTTP Basic Auth
// gate (no member session needed). Bypasses the member-self 30-day
// cooldown and records the change in the audit log as
// changedBy: "admin", actorEmail: ADMIN_EMAIL.

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "admin_not_configured" },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const displayName = (payload as { displayName?: unknown })?.displayName;
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json(
      { error: "display_name_required" },
      { status: 400 }
    );
  }

  const result = await updateDisplayName(email, displayName, {
    kind: "admin",
    actorEmail: adminEmail,
  });
  if (!result.ok) {
    const status =
      result.error === "name_taken"
        ? 409
        : result.error === "storage_unavailable"
          ? 503
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    profile: result.profile,
    updatedComments: result.updatedComments,
  });
}
