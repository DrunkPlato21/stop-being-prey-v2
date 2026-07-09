import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin, isGuildHost } from "@/lib/comments";
import { getMembersTagCount } from "@/lib/kit";
import { HostNoteComposer } from "@/components/guild/HostNoteComposer";

export const metadata: Metadata = {
  title: "Host tools · The Guild",
};

export const dynamic = "force-dynamic";

// The Guild Host's private desk. Reachable only by the host (or the admin);
// anyone else gets a 404 so the surface doesn't announce itself. Today it
// holds one tool: the weekly note to paid members. Pinning the Question of
// the Week is done inline in the Guild itself, not from here.
export default async function GuildHostPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/guild/host");
  }
  if (!isGuildHost(session.email) && !isAdmin(session.email)) {
    notFound();
  }

  // Real recipient count from Kit's Members tag, so the confirm step shows a
  // true number. Null (Kit down / unconfigured) falls back to soft wording
  // in the composer.
  const memberCount = await getMembersTagCount().catch(() => null);

  return (
    <div style={{ maxWidth: "44rem", margin: "0 auto", padding: "3rem 1.25rem 5rem" }}>
      <header
        style={{
          marginBottom: "2.5rem",
          paddingBottom: "1.5rem",
          borderBottom: "1px solid var(--rule)",
        }}
      >
        <p
          className="eyebrow"
          style={{ letterSpacing: "0.32em", fontSize: "0.62rem", marginBottom: "0.4rem" }}
        >
          Host tools
        </p>
        <h1
          className="font-display"
          style={{ fontSize: "2.2rem", lineHeight: 1.1, margin: "0 0 0.6rem" }}
        >
          The weekly note
        </h1>
        <p style={{ color: "var(--ink-soft)", fontSize: "1.02rem", lineHeight: 1.55, margin: 0 }}>
          Write a note and send it to the paid members. It goes out through
          Kit, the same as the newsletter, so members can always unsubscribe.
          Send yourself a test first. Clay gets a copy of everything you send.
        </p>
        <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          <Link href="/guild" style={{ color: "var(--eye-deep)" }}>
            ← Back to the Guild
          </Link>
        </p>
      </header>

      <HostNoteComposer memberCount={memberCount} />
    </div>
  );
}
