import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { MemberNavServer } from "@/components/MemberNavServer";
import { MemberNavPreview } from "@/components/MemberNavPreview";

// Layout for /case-files. Mirrors /desk and /notes/(member) so the
// member sidebar is consistent across all member surfaces.
//
// Public-preview case files (e.g. /case-files/settled-fact) are
// reachable to unauthenticated visitors via the proxy's slug
// allowlist. When the request has no session, we render the
// MemberNavPreview — visually identical to the real member nav,
// but every link routes to /membership. The cold-traffic visitor
// sees the member-area chrome around the case file and gets
// funneled to the sales page the moment they try to navigate.

export default async function CaseFilesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  const previewMode = !session?.email;

  return (
    <div className="md:flex md:max-w-6xl md:mx-auto md:gap-10 md:px-6">
      {previewMode ? <MemberNavPreview active="The Arena" /> : <MemberNavServer />}
      <div className="md:flex-1 md:min-w-0">{children}</div>
    </div>
  );
}
