import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getMember } from "@/lib/members";
import { WritersDesk } from "@/components/WritersDesk";
import { WelcomeModal } from "@/components/WelcomeModal";

export const metadata: Metadata = {
  title: "The Writer's Desk",
  description: "Your members-area home base.",
};

export const dynamic = "force-dynamic";

// Member landing. Page is the widget — nothing above it, nothing
// below it. The widget itself carries its own WRITER'S DESK header,
// so the page omits the H1 entirely.

export default async function DeskPage() {
  // Load the member record so the welcome modal can surface a
  // founder badge for first-100 members. The modal is localStorage-
  // gated on the client, so this read only matters on first visit.
  // Cheap Upstash get; degrades to null if the user has no session
  // (the welcome modal still renders, just without the founder block).
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  const member = session ? await getMember(session.email) : null;

  return (
    <div>
      {/* Welcome modal — client island, only renders on first visit
          (localStorage-gated). Server emits nothing for it on initial
          paint so there's no flash for returning members. */}
      <WelcomeModal
        founderSlot={member?.founderSlot ?? null}
        amountCents={member?.amountCents ?? null}
        interval={member?.interval ?? null}
      />

      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <WritersDesk />
      </section>
    </div>
  );
}
