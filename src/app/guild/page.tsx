import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfilesByEmails, isGuildHost } from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMembersByEmails,
  getTierBadge,
} from "@/lib/members";
import { getPinnedThread, listActiveThreads } from "@/lib/guild";
import { getGuildLastViewed, markNavViewed } from "@/lib/nav-dots";
import { GuildIndexView } from "@/components/guild/GuildIndexView";
import type { GuildBadgeInfo } from "@/components/guild/GuildByline";

export const metadata: Metadata = {
  title: "The Guild",
  description:
    "The members' library. Substantive threads, thought through, that last.",
};

export const dynamic = "force-dynamic";

export default async function GuildPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/guild");
  }

  // Capture the prior visit stamp BEFORE marking viewed, so the per-thread
  // NEW markers compare against the last time they were here, not now.
  const guildLastViewed = await getGuildLastViewed(session.email).catch(
    () => 0
  );

  const [pinned, page] = await Promise.all([
    getPinnedThread(),
    listActiveThreads({ limit: 50 }),
    // Seeing the room clears its nav dot. Cheap single SET; never blocks.
    markNavViewed("guild", session.email),
  ]);

  // Resolve author display names at read time (no denormalization on the
  // records), so a rename anywhere is reflected here automatically. Includes
  // each thread's last-reply author so the "last reply from <name>" cue on
  // the index resolves too. De-duped since starters and repliers overlap.
  const emails = [
    ...new Set(
      [
        pinned?.authorEmail,
        pinned?.lastReplyAuthorEmail,
        ...page.threads.flatMap((t) => [t.authorEmail, t.lastReplyAuthorEmail]),
      ].filter((e): e is string => !!e)
    ),
  ];
  const [profiles, memberMap] = await Promise.all([
    getProfilesByEmails(emails),
    getMembersByEmails(emails),
  ]);
  const names: Record<string, string> = {};
  for (const [email, profile] of profiles) {
    if (profile?.displayName) names[email] = profile.displayName;
  }
  const badges: Record<string, GuildBadgeInfo> = {};
  for (const [email, m] of memberMap) {
    badges[email] = {
      founderSlot: getFounderSlot(m),
      charterSlot: getCharterSlot(m),
      tierBadge: getTierBadge(m),
    };
  }
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim() ?? null;
  const hostEmail = process.env.GUILD_HOST_EMAIL?.toLowerCase().trim() ?? null;

  return (
    <GuildIndexView
      pinned={pinned}
      threads={page.threads}
      names={names}
      badges={badges}
      adminEmail={adminEmail}
      hostEmail={hostEmail}
      isHost={isGuildHost(session.email)}
      lastViewedAt={guildLastViewed}
    />
  );
}
