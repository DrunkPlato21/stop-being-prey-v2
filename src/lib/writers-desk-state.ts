import {
  derivePresenceState,
  getActiveAwayNote,
  getPresence,
  listRecentUpdates,
  type DeskPresence,
  type DeskUpdate,
  type PresenceState,
} from "./desk";
import { getRecentWorkEvents, type PulseEvent } from "./pulse";
import { getProfile, getProfilesByEmails, isAdmin } from "./comments";
import { getMember } from "./members";
import { listByMember, type Note } from "./notes";
import { getOnboarding } from "./onboarding";
import { getLatestPublished, type VoiceMemo } from "./voice-memos";
import {
  getActiveWallSnapshot,
  type ActiveWallSnapshot,
} from "./active-wall";
import { getLastVisited } from "./desk-visits";
import { getDeskPoolSignal, POOL_SEAT_FILL_PRICE_CENTS } from "./pool";
import { getLatestReply, getPinnedThread, listActiveThreads } from "./guild";
import { listBouts } from "./arena";
import {
  countRoomPresence,
  getLatestReply as getLatestLoungeReply,
  listVisiblePosts,
} from "./lounge";

// Voice memo widget cutoff: if Clay hasn't published a memo within this
// window, the whole "Voice from the desk" section drops off the widget.
// Keeps stale memos from dominating the layout weeks after the fact.
const VOICE_MEMO_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// The DESK's "live fight" cutoff. Deliberately not the same constant as
// arena-constants' ARENA_LIVE_WINDOW_MS (12h), which decides whether the
// room itself prints LIVE on a bout. This one is longer and answers a
// different question: how long a fight keeps the loud dark card at the
// top of the Desk's rooms section. Same idea as the voice memo's. A bout is
// open until it's sealed, which is right for the room but wrong for the
// Desk: an open bout nobody has added to in days is not a fight anyone
// would call live, and it would otherwise pin the loud dark card to the
// top of the rooms section forever with a byline counting up. Past this
// window the bout stays open — only the Desk's loud treatment expires.
// Reopening a sealed case to fix something doesn't reset lastTileAt, so
// a repair goes quiet on its own; adding a real tile makes it live again.
const ARENA_DESK_LIVE_WINDOW_MS = 72 * 60 * 60 * 1000;

// One-shot snapshot used by both the server component (initial paint)
// and the polling endpoint (live updates). Member-specific fields
// (memberNotes, isAdmin, isSignedIn) populate only when a viewer is
// passed in; they're empty/false for anonymous callers.

/** Live pulse of the two member rooms, surfaced on the Desk so the home
    base answers "what's alive now" at a glance. The Desk is the hub;
    the Guild and Lounge are the spokes you step out to. */
export type DeskRoomsSignal = {
  guild: {
    /** Clay's pinned Question of the Week, if one is up. The desk leads
        with this — it's the room's standing prompt. */
    questionOfWeek: {
      id: string;
      title: string;
      replyCount: number;
      lastActivityAt: number;
      /** Display name of whoever posted the latest activity (most recent
          reply, or the thread author if none), so the byline agrees with
          lastActivityAt. "Clay" for the author; null in dev fixtures. */
      authorName: string | null;
    } | null;
    /** The most-recently-active member thread (pinned excluded), so the
        peek also shows the life happening in response. */
    latest: {
      id: string;
      title: string;
      replyCount: number;
      lastActivityAt: number;
      /** Display name of whoever posted the latest activity (the most
          recent reply, or the thread author if there are no replies), so
          the name agrees with lastActivityAt. Null if unset (dev fixtures);
          real members always have one. */
      authorName: string | null;
    } | null;
  };
  lounge: {
    /** Members active in the room within the presence window. */
    activeNow: number;
    /** The most-recently-active post (bumped by replies), for a one-line
        "what's being said" peek that reflects the live conversation, not
        just the newest thread. */
    latest: {
      /** The parent post's id, so the desk peek can deep-link into the
          Lounge at that conversation (/lounge#post-<id>). When the latest
          activity is a reply, this stays the parent post id — the Lounge
          anchors on posts, and the reply lives inside that post. */
      id: string;
      firstName: string;
      body: string;
      createdAt: number;
      lastActivityAt: number;
    } | null;
  };
  /** The Arena's pulse: the live fight if one is open, else the latest
      filed case. When both are null the desk shows no Arena door at
      all — the room doesn't exist until there's been a fight. */
  arena: {
    open: {
      id: string;
      slug: string | null;
      title: string;
      tileCount: number;
      lastTileAt: number;
    } | null;
    /** Whether `open` is fresh enough to earn the Desk's live-fight
        treatment (see ARENA_DESK_LIVE_WINDOW_MS). False for a stalled bout,
        which stays open in the room but goes quiet on the Desk. Always
        false when `open` is null. */
    openIsLive: boolean;
    latestCase: {
      id: string;
      slug: string | null;
      title: string;
      caseNo: number | null;
      sealedAt: number | null;
    } | null;
  };
};

/** New-member onboarding checklist for the Desk's "Getting started"
    panel. Null once the member has finished every step, dismissed it, or
    aged out of the first-run window (and always for admin / anon). */
export type FirstRunState = {
  steps: { key: string; label: string; href: string; done: boolean }[];
};

/** The desk's pool-ask band: prompt an established member to cover a seat
    for a waiting reader. Null suppresses the band entirely (nobody
    waiting, or the viewer came in on a charity seat). */
export type DeskPoolAsk = {
  waiting: number;
  /** Best available anonymized waiter note, or null (band shows plain). */
  note: string | null;
  potCents: number;
  seatPriceCents: number;
};

export type WritersDeskState = {
  presence: DeskPresence;
  state: PresenceState;
  latestUpdate: DeskUpdate | null;
  awayNote: string | null;
  /** Site-content stream: essays, issues, pinned site events.
      Drives the "Recent work" section. Capped at 5. */
  recentWork: PulseEvent[];
  // Member-side data — folded into the same snapshot so the widget's
  // polling loop keeps past notes (and Clay's reply when it lands)
  // fresh without a second endpoint.
  memberNotes: Note[];
  /** The single most recent published voice memo. Null if none. */
  voiceMemo: VoiceMemo | null;
  /** Live snapshot of the wall to feature on the widget. Null when
      no active or recently-closed wall qualifies. */
  activeWall: ActiveWallSnapshot | null;
  /** Epoch ms of this viewer's last desk visit, used to drive NEW
      badges. Null on first visit or for anonymous viewers. */
  lastVisitedAt: number | null;
  /** The Guild + Lounge pulse for the hub panel. */
  rooms: DeskRoomsSignal;
  /** New-member onboarding checklist, or null when there's nothing to
      show (finished, dismissed, established member, admin, anon). */
  firstRun: FirstRunState | null;
  /** Pool-ask band (cover a seat for a waiting reader), or null to hide. */
  poolAsk: DeskPoolAsk | null;
  isSignedIn: boolean;
  isAdmin: boolean;
};

export async function getWritersDeskState(
  viewer?: { email: string }
): Promise<WritersDeskState> {
  const viewerEmail = viewer?.email ?? null;
  const viewerIsAdmin = viewerEmail ? isAdmin(viewerEmail) : false;
  // Admins don't see their own notes (they wouldn't have any — admin
  // can't post). Save the lookup.
  const shouldLoadMemberNotes = !!viewerEmail && !viewerIsAdmin;

  const [
    updates,
    presence,
    recentWork,
    memberNotes,
    voiceMemoRaw,
    activeWall,
    lastVisitedAt,
    guildPage,
    pinnedThread,
    loungeActiveNow,
    loungeLatest,
    arenaBouts,
  ] = await Promise.all([
    listRecentUpdates(1),
    getPresence(),
    getRecentWorkEvents(),
    shouldLoadMemberNotes
      ? listByMember(viewerEmail!)
      : Promise.resolve([] as Note[]),
    getLatestPublished(),
    getActiveWallSnapshot(),
    viewerEmail && !viewerIsAdmin
      ? getLastVisited(viewerEmail)
      : Promise.resolve(null),
    // Fetch a few: listActiveThreads filters the pinned thread out AFTER
    // slicing to the limit, so limit:1 can come back empty when the
    // pinned Question of the Week is the most-recently-active. A small
    // buffer guarantees we land on a real non-pinned thread.
    listActiveThreads({ limit: 5 }),
    getPinnedThread(),
    countRoomPresence(),
    // Pull a small page (the feed is ordered by last activity, which a
    // reply can bump), then pick the genuinely newest post by when it
    // was written so the desk peek's name + timestamp always agree.
    listVisiblePosts({ limit: 10 }),
    // Newest-active first; enough to find the top open bout and the
    // newest filed case without walking the whole index.
    listBouts(12),
  ]);
  const now = Date.now();
  const state = derivePresenceState(presence, now);
  const awayNote =
    state === "manually-away" ? getActiveAwayNote(presence, now) : null;

  // Drop the voice memo from the snapshot once it's older than the
  // fresh-window so the section auto-hides on the widget rather than
  // showing a stale "Voice from the desk" card.
  const voiceMemo =
    voiceMemoRaw &&
    voiceMemoRaw.publishedAt !== null &&
    now - voiceMemoRaw.publishedAt <= VOICE_MEMO_FRESH_WINDOW_MS
      ? voiceMemoRaw
      : null;

  // Pick the most-recently-active post (lastActivityAt bumps on replies),
  // not the newest one, so the peek reflects the conversation that's alive
  // right now instead of looking dead whenever the newest thread is quiet.
  let latestLoungePost: (typeof loungeLatest.posts)[number] | null = null;
  for (const p of loungeLatest.posts) {
    if (
      !latestLoungePost ||
      p.lastActivityAt > latestLoungePost.lastActivityAt
    ) {
      latestLoungePost = p;
    }
  }
  // The Lounge peek must agree with itself: name, words, and time should all
  // point at the same event. When the freshest post was bumped by a reply,
  // that reply IS the latest activity — show its author + body + time. With
  // no replies the post itself is the latest. (Mirrors the Guild peek fix:
  // before this, a reply bumped a post to the top but the peek still showed
  // the original author's words against the reply's timestamp.)
  let loungeLatestPeek = latestLoungePost
    ? {
        // Deep-link target: always the parent post id (the Lounge anchors
        // on posts), whether the latest activity is the post or a reply.
        id: latestLoungePost.id,
        firstName: latestLoungePost.firstName,
        body: latestLoungePost.body,
        createdAt: latestLoungePost.createdAt,
        lastActivityAt: latestLoungePost.lastActivityAt,
      }
    : null;
  if (latestLoungePost && latestLoungePost.replyCount > 0) {
    const latestReply = await getLatestLoungeReply(latestLoungePost.id);
    if (latestReply) {
      loungeLatestPeek = {
        id: latestLoungePost.id,
        firstName: latestReply.firstName,
        body: latestReply.body,
        // Keep the post's lastActivityAt (it bumps to the reply's time) so
        // the "ago" stays the live-activity clock the feed sorts on.
        createdAt: latestReply.createdAt,
        lastActivityAt: latestLoungePost.lastActivityAt,
      };
    }
  }
  // The Guild peek's name must agree with its timestamp (latest activity),
  // so attribute it to whoever posted the most recent reply — not who
  // started the thread. Falls back to the thread's author when it has no
  // replies yet (then the original post IS the latest activity).
  const latestThread = guildPage.threads[0] ?? null;
  let guildActivityEmail = latestThread?.authorEmail ?? null;
  if (latestThread && latestThread.replyCount > 0) {
    const latestReply = await getLatestReply(latestThread.id);
    if (latestReply) guildActivityEmail = latestReply.authorEmail;
  }
  // Same rule for the pinned Question of the Week: attribute it to whoever
  // posted the most recent reply (or the thread author when there are no
  // replies), so its byline agrees with its lastActivityAt exactly like
  // the "Active now" thread and the Lounge peek do.
  let qotwActivityEmail = pinnedThread?.authorEmail ?? null;
  if (pinnedThread && pinnedThread.replyCount > 0) {
    const latestReply = await getLatestReply(pinnedThread.id);
    if (latestReply) qotwActivityEmail = latestReply.authorEmail;
  }
  const guildEmailsToResolve = [guildActivityEmail, qotwActivityEmail].filter(
    (e): e is string => !!e
  );
  const guildProfiles = guildEmailsToResolve.length
    ? await getProfilesByEmails(guildEmailsToResolve)
    : null;
  // The admin/author has no member profile, so mirror the Guild byline's
  // convention (email === admin → "Clay"); members resolve to their set
  // display name. Without this, a thread whose latest reply is Clay's
  // would show no name at all.
  const resolveGuildName = (email: string | null): string | null =>
    email
      ? isAdmin(email)
        ? "Clay"
        : guildProfiles?.get(email)?.displayName ?? null
      : null;
  const guildLatestName = resolveGuildName(guildActivityEmail);
  const qotwActivityName = resolveGuildName(qotwActivityEmail);

  // First-run onboarding inputs (members only; admin + anon skip).
  const isMember = !!viewerEmail && !viewerIsAdmin;
  let onboarding: Awaited<ReturnType<typeof getOnboarding>> | null = null;
  let viewerProfile: Awaited<ReturnType<typeof getProfile>> = null;
  let memberRecord: Awaited<ReturnType<typeof getMember>> = null;
  if (isMember) {
    [onboarding, viewerProfile, memberRecord] = await Promise.all([
      getOnboarding(viewerEmail!),
      getProfile(viewerEmail!),
      getMember(viewerEmail!),
    ]);
  }

  // Show the panel only to members still in their first 30 days, until
  // they've done every step or dismissed it. Established members never
  // get nagged. The name step derives from the profile; the other three
  // are marked when the member actually does the thing.
  const FIRST_RUN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  let firstRun: FirstRunState | null = null;
  if (isMember && memberRecord) {
    const joinedRecently =
      typeof memberRecord.createdAt === "number" &&
      now - memberRecord.createdAt < FIRST_RUN_WINDOW_MS;
    const nameDone = !!viewerProfile?.displayNameChangedAt;
    const guildDone = !!onboarding?.guild;
    const loungeDone = !!onboarding?.lounge;
    const allDone = nameDone && loungeDone && guildDone;
    if (joinedRecently && !onboarding?.dismissedAt && !allDone) {
      const qotwHref = pinnedThread ? `/guild/${pinnedThread.id}` : "/guild";
      firstRun = {
        steps: [
          { key: "name", label: "Set your name", href: "/notes/account", done: nameDone },
          { key: "lounge", label: "Say hi in the Lounge", href: "/lounge", done: loungeDone },
          {
            key: "qotw",
            label: "Answer the Question of the Week",
            href: qotwHref,
            done: guildDone,
          },
        ],
      };
    }
  }

  // Pool-ask band. Shown to a signed-in viewer when someone's actually
  // waiting, and hidden for anyone who came in on a charity seat (gifted
  // or pooled) — don't ask the just-helped to pay it forward on day one.
  // Admin has no member record, so Clay sees it (useful as a live read).
  let poolAsk: DeskPoolAsk | null = null;
  if (viewerEmail) {
    const viaCharity = !!(
      memberRecord?.viaPoolFundId || memberRecord?.viaGiftId
    );
    if (!viaCharity) {
      const sig = await getDeskPoolSignal();
      if (sig.waiting > 0) {
        poolAsk = {
          waiting: sig.waiting,
          note: sig.note,
          potCents: sig.potCents,
          seatPriceCents: POOL_SEAT_FILL_PRICE_CENTS,
        };
      }
    }
  }

  const rooms: DeskRoomsSignal = {
    guild: {
      questionOfWeek: pinnedThread
        ? {
            id: pinnedThread.id,
            title: pinnedThread.title,
            replyCount: pinnedThread.replyCount,
            lastActivityAt: pinnedThread.lastActivityAt,
            authorName: qotwActivityName,
          }
        : null,
      latest: latestThread
        ? {
            id: latestThread.id,
            title: latestThread.title,
            replyCount: latestThread.replyCount,
            lastActivityAt: latestThread.lastActivityAt,
            authorName: guildLatestName,
          }
        : null,
    },
    lounge: {
      activeNow: loungeActiveNow,
      latest:
        loungeLatestPeek && loungeLatestPeek.body.trim()
          ? {
              id: loungeLatestPeek.id,
              firstName: loungeLatestPeek.firstName,
              body: loungeLatestPeek.body,
              createdAt: loungeLatestPeek.createdAt,
              lastActivityAt: loungeLatestPeek.lastActivityAt,
            }
          : null,
    },
    arena: (() => {
      // An empty bout is not a fight yet. A bout counts as open from the
      // moment it is named, so without this the Desk announces ON THE
      // SLAB NOW / 0 tiles to every member the instant Clay types a
      // title — before there is anything to watch, and while he is still
      // deciding whether to keep it. The room's own index still lists it
      // for him; the Desk waits for the first tile.
      const openBout =
        arenaBouts.find((b) => b.status === "open" && b.tileCount > 0) ?? null;
      const sealed = arenaBouts
        .filter((b) => b.status === "sealed")
        .sort((a, b) => (b.sealedAt ?? 0) - (a.sealedAt ?? 0))[0];
      return {
        open: openBout
          ? {
              id: openBout.id,
              slug: openBout.slug,
              title: openBout.title,
              tileCount: openBout.tileCount,
              lastTileAt: openBout.lastTileAt,
            }
          : null,
        openIsLive:
          !!openBout &&
          Date.now() - openBout.lastTileAt <= ARENA_DESK_LIVE_WINDOW_MS,
        latestCase: sealed
          ? {
              id: sealed.id,
              slug: sealed.slug,
              title: sealed.title,
              caseNo: sealed.caseNo,
              sealedAt: sealed.sealedAt,
            }
          : null,
      };
    })(),
  };

  return {
    presence,
    state,
    latestUpdate: updates[0] ?? null,
    awayNote,
    recentWork,
    memberNotes,
    voiceMemo,
    activeWall,
    lastVisitedAt,
    rooms,
    firstRun,
    poolAsk,
    isSignedIn: !!viewerEmail,
    isAdmin: viewerIsAdmin,
  };
}
