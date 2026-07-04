import { NextResponse } from "next/server";
import { createMagicLink } from "@/lib/auth";
import { getMember } from "@/lib/members";

// These links are always handed to a real member, and the token always
// lands in the shared production Redis. So the URL must point at the live
// site even when minted from a localhost admin session — never emit
// http://localhost here. Matches scripts/mint-founder-access.mjs.
const PROD_ORIGIN = "https://stopbeingprey.com";

// POST /api/admin/members/:email/sign-in-link
//
// Mints a single-use, 7-day production sign-in link for a member and
// returns it for the admin to paste into a personal email. For members
// whose automated sign-in email doesn't land (corporate inbox filtering,
// a non-technical member who can't work the request-a-link form).
//
// Lives under /api/admin/* so it inherits the proxy's HTTP Basic Auth
// gate (no member session needed), same as the sibling rename route.
// Unlike /api/auth/request-link this does NOT rate-limit or silently
// swallow a missing member — the admin needs to see exactly what
// happened, so we surface member_not_found directly.

export const runtime = "nodejs";

const LINK_TTL_DAYS = 7;
const LINK_TTL_SECONDS = 60 * 60 * 24 * LINK_TTL_DAYS;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Source of truth is the webhook-maintained member record (same call
  // /api/auth/request-link trusts). We don't re-check status here: an
  // admin minting a link by hand has already decided this person should
  // get in. We just need the member's customerId for the session JWT.
  const member = await getMember(email, { prod: true }).catch(() => null);
  if (!member) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  const id = await createMagicLink(
    { email, customerId: member.stripeCustomerId, next: "/desk" },
    LINK_TTL_SECONDS
  );
  if (!id) {
    return NextResponse.json(
      { error: "storage_unavailable" },
      { status: 503 }
    );
  }

  const url = `${PROD_ORIGIN}/api/auth/callback?token=${encodeURIComponent(id)}`;
  return NextResponse.json({
    ok: true,
    url,
    expiresInDays: LINK_TTL_DAYS,
  });
}
