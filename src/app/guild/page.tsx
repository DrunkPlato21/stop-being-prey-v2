import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getProfile, getProfilesByEmails, isAdmin } from "@/lib/comments";
import {
  getCharterSlot,
  getFounderSlot,
  getMembersByEmails,
  getTierBadge,
} from "@/lib/members";
import { getPinnedThread, listActiveThreads, searchThreads } from "@/lib/guild";
import { isGuildCategory } from "@/lib/guild-constants";
import { getGuildLastViewed, markNavViewed } from "@/lib/nav-dots";
import { GuildIndexView } from "@/components/guild/GuildIndexView";
import type { GuildBadgeInfo } from "@/components/guild/GuildByline";

export const metadata: Metadata = {
  title: "The Guild",
  description:
    "The members' deep room. Substantive threads, thought through, that last.",
};

export const dynamic = "force-dynamic";

// One page of the library. Deliberately smaller than the old hard 50: the
// list is scanned, not read, and "Load older" is now a real control rather
// than a cliff the member can't see.
const PAGE_SIZE = 30;

export default async function GuildPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; before?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const category = isGuildCategory(sp.kind) ? sp.kind : null;
  const beforeRaw = Number(sp.before);
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;

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

  // A search replaces the library listing with its results, so the two
  // reads are exclusive: no point paging a list nobody is going to see.
  const search = q ? await searchThreads(q) : null;

  const [pinnedRaw, page] = await Promise.all([
    search ? Promise.resolve(null) : getPinnedThread(),
    search
      ? Promise.resolve({ threads: [], hasMore: false })
      : listActiveThreads({
          limit: PAGE_SIZE,
          before,
          category: category ?? undefined,
        }),
    // Seeing the room clears its nav dot. Cheap single SET; never blocks.
    markNavViewed("guild", session.email),
  ]);

  // The Question of the Week holds its slot at the top of the whole
  // library, but a filtered view is a claim about what's in that kind of
  // thread: showing a doctrine QOTW above a list of field threads would
  // make the filter a lie. Page two is a continuation of the list, so the
  // pinned card doesn't repeat there either.
  const pinned =
    !before && (!category || pinnedRaw?.category === category)
      ? pinnedRaw
      : null;

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
        ...(search?.hits ?? []).flatMap((h) => [
          h.thread.authorEmail,
          h.replyAuthorEmail,
        ]),
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

  // First-post name gate: a member with no display name yet gets an inline
  // name field in the composer (the server action requires it). Admin is
  // exempt — Clay posts as "Clay".
  const viewerProfile = isAdmin(session.email)
    ? null
    : await getProfile(session.email).catch(() => null);
  const needsDisplayName =
    !isAdmin(session.email) && !viewerProfile?.displayName?.trim();

  return (
    <GuildIndexView
      pinned={pinned}
      threads={page.threads}
      names={names}
      badges={badges}
      adminEmail={adminEmail}
      hostEmail={hostEmail}
      lastViewedAt={guildLastViewed}
      needsDisplayName={needsDisplayName}
      category={category}
      hasMore={page.hasMore}
      isPage2={!!before}
      q={q}
      search={search}
    />
  );
}
