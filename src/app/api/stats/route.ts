import { NextResponse } from "next/server";
import {
  CHARTER_CAP,
  FOUNDER_CAP,
  countMembers,
  getCharterClaimed,
  getFounderClaimed,
} from "@/lib/members";
import { getSubscriberCount } from "@/lib/kit";
import {
  STANDARD_MONTHLY_FLOOR_CENTS,
  standardFloorCents,
} from "@/lib/membership";

// Single source of truth for every counter shown on the site: the
// reader count (Kit, behind its own 1h data cache), the room count and
// the seat scarcity (Redis, live). The counter components fetch THIS
// route from the browser, so every page shows the same numbers no
// matter how the page itself is rendered or cached — the fix for an
// essay footer saying "77 charter seats" while the force-dynamic
// membership page said 73.
//
// Freshness: the origin computes live on every miss; the CDN may serve
// the response for up to 60s (s-maxage). So the widest possible
// disagreement between any two surfaces is one minute, never a deploy.
//
// On a Redis error each claimed count falls back to its cap, so the
// scarcity lines quietly disappear instead of showing a wrong number.
// That same fallback makes floorMonthlyCents read $18, the post-charter
// price: if we cannot tell whether the window is still open, the safe
// thing to quote is the higher floor, which checkout will agree with.
//
// floorMonthlyCents is here so no client component has to hardcode the
// price. The $13 -> $18 raise fires the moment the charter cap fills,
// with no deploy, and this is the field that carries it to every piece
// of copy on the site at the same moment.

export const dynamic = "force-dynamic";

export async function GET() {
  const [readers, members, founderClaimed, charterClaimed] =
    await Promise.all([
      getSubscriberCount(),
      countMembers()
        .then((c) => c.active)
        .catch(() => 0),
      getFounderClaimed().catch(() => FOUNDER_CAP),
      getCharterClaimed().catch(() => CHARTER_CAP),
    ]);

  const charterRemaining = Math.max(0, CHARTER_CAP - charterClaimed);

  return NextResponse.json(
    {
      readers,
      members,
      founderRemaining: Math.max(0, FOUNDER_CAP - founderClaimed),
      charterRemaining,
      floorMonthlyCents: standardFloorCents("monthly", charterRemaining > 0),
      standardMonthlyCents: STANDARD_MONTHLY_FLOOR_CENTS,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
