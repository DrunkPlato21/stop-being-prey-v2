import { getAdminNavBadges } from "@/lib/admin-nav-badges";

// GET /api/admin/nav-badges
//
// Returns the per-section unread state for the admin top nav.
// Fetched client-side by AdminPersistentNav on every pathname change
// because Next.js 16 reuses the layout's RSC payload between sibling
// route navigations. The shared /admin layout's getAdminNavBadges()
// call would otherwise freeze at first page load.
//
// Gated by proxy.ts via HTTP Basic auth on /api/admin/*.

export const runtime = "nodejs";

export async function GET() {
  const badges = await getAdminNavBadges();
  return Response.json(badges, {
    headers: { "Cache-Control": "no-store" },
  });
}
