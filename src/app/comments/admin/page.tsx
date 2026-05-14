import { redirect } from "next/navigation";

// Legacy path. The comments moderation queue moved to /admin/comments
// to live alongside the other /admin/* surfaces and inherit the same
// HTTP Basic auth gate. Old bookmarks / email links land here and
// bounce through.

export const dynamic = "force-dynamic";

export default function LegacyCommentsAdminRedirect() {
  redirect("/admin/comments");
}
