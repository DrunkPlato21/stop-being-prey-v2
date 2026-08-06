import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  getProfile,
  getProfilesByEmails,
  isAdmin,
} from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMembersByEmails,
  getTierBadge,
} from "@/lib/members";
import {
  getGuildReactions,
  getThread,
  getThreadLastRead,
  getWatchState,
  listReplies,
  markThreadRead,
} from "@/lib/guild";
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

  // Capture the prior read stamp BEFORE recording this visit, so the
  // markers describe what arrived since last time and not "nothing".
  const lastReadAt = await getThreadLastRead(id, session.email).catch(() => 0);
  // The bell reflects EMAIL, which is the only thing a member consents to:
  // "auto" (joined by taking part, in-app notices only) reads as not
  // watching, so the control still offers the way in.
  const watchState = await getWatchState(id, session.email).catch(
    () => "none" as const
  );

  const replies = await listReplies(id);

  // This visit reads the thread to its current end. Fire and forget: the
  // page must never wait on, or fail from, a bookkeeping write.
  void markThreadRead(id, session.email);

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

  // First-reply name gate: a member with no display name yet gets an inline
  // name field in the reply composer (the server action requires it). Admin
  // is exempt — Clay posts as "Clay". Reuse the batched profiles map when the
  // viewer already appears in it (thread/reply author), else one small read.
  const viewerHasName = isAdmin(session.email)
    ? true
    : !!(
        profiles.get(session.email.toLowerCase().trim())?.displayName?.trim() ||
        (await getProfile(session.email).catch(() => null))?.displayName?.trim()
      );
  const needsDisplayName = !viewerHasName;

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
      reactions={reactions}
      needsDisplayName={needsDisplayName}
      lastReadAt={lastReadAt}
      watching={watchState === "on"}
    />
  );
}
