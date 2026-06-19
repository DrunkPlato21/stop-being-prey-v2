import {
  derivePresenceState,
  getActiveAwayNote,
  getPresence,
  listRecentUpdates,
  type DeskPresence,
  type DeskUpdate,
  type PresenceState,
} from "./desk";
import {
  getElsewhereEvents,
  getRecentWorkEvents,
  type PulseEvent,
} from "./pulse";
import { getProfilesByEmails, isAdmin } from "./comments";
import { listByMember, type Note } from "./notes";
import { getLatestPublished, type VoiceMemo } from "./voice-memos";
import {
  getActiveWallSnapshot,
  type ActiveWallSnapshot,
} from "./active-wall";
import { getLastVisited } from "./desk-visits";
import { getPinnedThread, listActiveThreads } from "./guild";
import { countRoomPresence, listVisiblePosts } from "./lounge";

// Voice memo widget cutoff: if Clay hasn't published a memo within this
// window, the whole "Voice from the desk" section drops off the widget.
// Keeps stale memos from dominating the layout weeks after the fact.
const VOICE_MEMO_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    } | null;
    /** The most-recently-active member thread (pinned excluded), so the
        peek also shows the life happening in response. */
    latest: {
      id: string;
      title: string;
      replyCount: number;
      lastActivityAt: number;
      /** Author's display name, or null if they haven't set one (e.g.
          dev fixtures). Real members always have one. */
      authorName: string | null;
    } | null;
  };
  lounge: {
    /** Members active in the room within the presence window. */
    activeNow: number;
    /** The newest post, for a one-line "what's being said" peek. */
    latest: { firstName: string; body: string; createdAt: number } | null;
  };
};

export type WritersDeskState = {
  presence: DeskPresence;
  state: PresenceState;
  latestUpdate: DeskUpdate | null;
  awayNote: string | null;
  /** Site-content stream: essays, field notes, issues, case files.
      Drives the "Recent work" section. Capped at 5. */
  recentWork: PulseEvent[];
  /** Social-channel stream: admin-curated X + Facebook posts.
      Drives the "Elsewhere" section. Capped at 3. */
  elsewhere: PulseEvent[];
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
    elsewhere,
    memberNotes,
    voiceMemoRaw,
    activeWall,
    lastVisitedAt,
    guildPage,
    pinnedThread,
    loungeActiveNow,
    loungeLatest,
  ] = await Promise.all([
    listRecentUpdates(1),
    getPresence(),
    getRecentWorkEvents(),
    getElsewhereEvents(),
    shouldLoadMemberNotes
      ? listByMember(viewerEmail!)
      : Promise.resolve([] as Note[]),
    getLatestPublished(),
    getActiveWallSnapshot(),
    viewerEmail && !viewerIsAdmin
      ? getLastVisited(viewerEmail)
      : Promise.resolve(null),
    listActiveThreads({ limit: 1 }),
    getPinnedThread(),
    countRoomPresence(),
    // Pull a small page (the feed is ordered by last activity, which a
    // reply can bump), then pick the genuinely newest post by when it
    // was written so the desk peek's name + timestamp always agree.
    listVisiblePosts({ limit: 10 }),
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

  let latestLoungePost: (typeof loungeLatest.posts)[number] | null = null;
  for (const p of loungeLatest.posts) {
    if (!latestLoungePost || p.createdAt > latestLoungePost.createdAt) {
      latestLoungePost = p;
    }
  }
  // Resolve the latest thread author's display name so the Guild peek
  // can show who started it. Null for fixtures with no profile set.
  const latestThread = guildPage.threads[0] ?? null;
  const guildProfiles = latestThread
    ? await getProfilesByEmails([latestThread.authorEmail])
    : null;

  const rooms: DeskRoomsSignal = {
    guild: {
      questionOfWeek: pinnedThread
        ? {
            id: pinnedThread.id,
            title: pinnedThread.title,
            replyCount: pinnedThread.replyCount,
            lastActivityAt: pinnedThread.lastActivityAt,
          }
        : null,
      latest: latestThread
        ? {
            id: latestThread.id,
            title: latestThread.title,
            replyCount: latestThread.replyCount,
            lastActivityAt: latestThread.lastActivityAt,
            authorName:
              guildProfiles?.get(latestThread.authorEmail)?.displayName ?? null,
          }
        : null,
    },
    lounge: {
      activeNow: loungeActiveNow,
      latest:
        latestLoungePost && latestLoungePost.body.trim()
          ? {
              firstName: latestLoungePost.firstName,
              body: latestLoungePost.body,
              createdAt: latestLoungePost.createdAt,
            }
          : null,
    },
  };

  return {
    presence,
    state,
    latestUpdate: updates[0] ?? null,
    awayNote,
    recentWork,
    elsewhere,
    memberNotes,
    voiceMemo,
    activeWall,
    lastVisitedAt,
    rooms,
    isSignedIn: !!viewerEmail,
    isAdmin: viewerIsAdmin,
  };
}
