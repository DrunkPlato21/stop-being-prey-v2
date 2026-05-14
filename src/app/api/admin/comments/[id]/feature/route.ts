import { NextResponse } from "next/server";
import { setFeatured } from "@/lib/comments";

// POST /api/admin/comments/:id/feature  body: { featured: boolean }
// Admin-gated feature toggle. Lives under /api/admin/* so the proxy's
// Basic auth gate covers it. Identity flows through ADMIN_EMAIL.

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
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
  const featured = (payload as { featured?: unknown })?.featured;
  if (typeof featured !== "boolean") {
    return NextResponse.json({ error: "missing_featured" }, { status: 400 });
  }

  const result = await setFeatured(id, adminEmail, featured);
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden"
          ? 403
          : 503;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, comment: result.comment });
}
