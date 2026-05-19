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
import { isAdmin } from "./comments";
import { listByMember, type Note } from "./notes";
import { getLatestPublished, type VoiceMemo } from "./voice-memos";
import {
  getActiveWallSnapshot,
  type ActiveWallSnapshot,
} from "./active-wall";
import { getLastVisited } from "./desk-visits";

// Voice memo widget cutoff: if Clay hasn't published a memo within this
// window, the whole "Voice from the desk" section drops off the widget.
// Keeps stale memos from dominating the layout weeks after the fact.
const VOICE_MEMO_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// One-shot snapshot used by both the server component (initial paint)
// and the polling endpoint (live updates). Member-specific fields
// (memberNotes, isAdmin, isSignedIn) populate only when a viewer is
// passed in; they're empty/false for anonymous callers.

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
    isSignedIn: !!viewerEmail,
    isAdmin: viewerIsAdmin,
  };
}
