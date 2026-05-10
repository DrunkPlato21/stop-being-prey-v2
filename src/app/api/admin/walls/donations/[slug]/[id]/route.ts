import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { setDonationStatus } from "@/lib/wallDonations";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = (body as { action?: unknown })?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject".' },
      { status: 400 }
    );
  }

  const status = action === "approve" ? "approved" : "rejected";
  const updated = await setDonationStatus(slug, id, status);
  if (!updated) {
    return NextResponse.json({ error: "Donation not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, donation: updated });
}
