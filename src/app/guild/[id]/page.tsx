import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfilesByEmails, isAdmin, isGuildHost } from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMembersByEmails,
  getTierBadge,
} from "@/lib/members";
import { getGuildReactions, getThread, listReplies } from "@/lib/guild";
import { ThreadView } from "@/components/guild/ThreadView";
import type { GuildBadgeInfo } from "@/components/guild/GuildByline";

export const metadata: Metadata = {
  title: "The Guild",
};

export const dynamic = "force-dynamic";

export default async function GuildThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect(`/notes/sign-in?next=/guild/${id}`);
  }

  const thread = await getThread(id);
  if (!thread) notFound();

  const replies = await listReplies(id);

  const emails = [thread.authorEmail, ...replies.map((r) => r.authorEmail)];
  const [profiles, memberMap, reactions] = await Promise.all([
    getProfilesByEmails(emails),
    getMembersByEmails(emails),
    getGuildReactions(
      [thread.id, ...replies.map((r) => r.id)],
      session.email
    ),
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
    <ThreadView
      thread={thread}
      replies={replies}
      names={names}
      badges={badges}
      adminEmail={adminEmail}
      hostEmail={hostEmail}
      viewerEmail={session.email}
      isAdmin={isAdmin(session.email)}
      canPinThread={isAdmin(session.email) || isGuildHost(session.email)}
      reactions={reactions}
    />
  );
}
