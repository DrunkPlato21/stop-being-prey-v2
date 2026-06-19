import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { MemberNavServer } from "@/components/MemberNavServer";

// Layout for the public /rules doctrine page.
//
// The Rules are the public front door — the doctrine is the lure. So
// the chrome is auth-aware:
//   - Signed-in member: the standard member sidebar (same shell as
//     /desk, /case-files, etc.) so they keep a way home and the page
//     reads as part of the room.
//   - Stranger: NO side nav. The page renders bare — wordmark + Join in
//     the header (HeaderPublicNav self-hides on /rules) and the in-body
//     "Join to train" CTA carry the funnel. A clean, open front door
//     focused on read-then-join, not a fake locked-room shell. (This is
//     the deliberate difference from the public-preview case files,
//     which DO show a member-nav preview.)

export default async function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );

  if (!session?.email) {
    // Stranger: bare page. The rules page centers its own content.
    return <>{children}</>;
  }

  return (
    <div className="md:flex md:max-w-6xl md:mx-auto md:gap-10 md:px-6">
      <MemberNavServer />
      <div className="md:flex-1 md:min-w-0">{children}</div>
    </div>
  );
}
