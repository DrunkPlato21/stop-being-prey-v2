import type { Metadata } from "next";
import {
  derivePresenceState,
  getActiveAwayNote,
  getPresence,
  listRecentUpdates,
} from "@/lib/desk";
import { getWallOverride } from "@/lib/active-wall";
import { getAllWalls } from "@/lib/walls";
import { listPresenceSnapshot } from "@/lib/presence";
import { describePresence } from "@/lib/presence-labels";
import { listAll } from "@/lib/notes";
import {
  ActiveWallControl,
  DeskAdminForm,
  DeleteDeskUpdateButton,
  PresenceToggle,
} from "@/components/DeskAdminForm";
import { BroadcastForm } from "@/components/BroadcastForm";
import { OnTheSiteBadge } from "@/components/OnTheSiteBadge";
import { LiveAdminNotesPanel } from "@/components/LiveAdminNotesPanel";
import { Linkified } from "@/components/Linkified";
import { WatchFeedAdmin } from "@/components/WatchFeedAdmin";
import { RoomPresenceControl } from "@/components/RoomPresenceControl";
import { PromptScheduler } from "@/components/PromptScheduler";
import { listWatchPosts } from "@/lib/watch-feed";

// Dark-mode toggle + no-flash script live in src/app/admin/layout.tsx
// so every admin page shares the same control without each page
// having to wire it in.

export const metadata: Metadata = {
  title: "Writer's Desk",
};

export const dynamic = "force-dynamic";

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Admin surface for the Writer's Desk feed. HTTP Basic auth gates the
// /admin path via proxy.ts — anyone reaching this page has already
// proven they hold ADMIN_PASSWORD.
//
// Page is organized as three clearly-labeled sections so the primary
// flow (flip presence, drop a note, triage the inbox) reads top-to-
// bottom:
//
//   1. Right now      presence toggle + status composer + latest
//                     status. This is Clay's day-to-day control.
//   2. Notes inbox    member notes from the desk, prioritised when
//                     any are unread. Renders only when active notes
//                     exist; "Jump to all" link drops into /admin/notes.
//   3. Signals        broadcast form + active wall override. Less
//                     frequent actions; kept below the inbox.
//
// Cross-admin nav lives in the layout (AdminPersistentNav) so every
// /admin/* surface shares the same utility rail.

// Window for the "On the site" badge in the masthead. Matches the
// /admin/presence panel so the two views agree about who's around.
const PRESENCE_WINDOW_MINUTES = 30;

export default async function DeskAdminPage() {
  const now = Date.now();
  const presenceSinceMs = now - PRESENCE_WINDOW_MINUTES * 60 * 1000;
  const [
    updates,
    presence,
    activeNotes,
    wallOverride,
    presenceEntries,
    watchFeed,
  ] = await Promise.all([
    listRecentUpdates(1),
    getPresence(),
    listAll({ status: "active", limit: 50 }),
    getWallOverride(),
    listPresenceSnapshot(presenceSinceMs, now).then(describePresence),
    listWatchPosts(20),
  ]);
  const current = updates[0];
  const state = derivePresenceState(presence);
  const awayNote = getActiveAwayNote(presence) ?? "";

  const wallChoices = getAllWalls().map((w) => ({
    slug: w.slug,
    title: w.title,
    status: w.status,
  }));
  const pinnedWall = wallOverride.featuredSlug
    ? wallChoices.find((w) => w.slug === wallOverride.featuredSlug) ?? null
    : null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
      {/* === Masthead =====================================
          Title + live visitor badge. The cross-admin nav lives in
          the layout above this page; the dark-mode toggle floats
          at the fixed top-right corner. */}
      <header className="flex items-baseline justify-between gap-4 mb-6 flex-wrap">
        <h1
          className="font-display text-ink leading-tight tracking-tight"
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Writer&apos;s Desk
        </h1>
        <OnTheSiteBadge
          initialEntries={presenceEntries}
          windowMinutes={PRESENCE_WINDOW_MINUTES}
          generatedAt={now}
        />
      </header>

      {/* === Section 1: Right now ==========================
          Day-to-day control surface. Presence toggle + status
          composer + the latest status note all live together so
          the primary flow ("am I in? what'd I just say?") reads
          as one block. */}
      <section className="mb-14">
        {current ? (
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p
                className="eyebrow mb-2"
                style={{ fontSize: "0.6rem" }}
              >
                Last status &middot; {formatTimestamp(current.createdAt)}
              </p>
              <p
                className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: "1rem" }}
              >
                <Linkified text={current.body} />
              </p>
            </div>
            <DeleteDeskUpdateButton id={current.id} />
          </div>
        ) : null}

        <PresenceToggle
          initialState={state}
          initialActive={presence.active}
          initialAwayNote={awayNote}
        />

        {/* Status composer only appears while Clay is at the desk. When
            away, the surface above (toggle + away-note editor) is the
            whole control set — no point in offering "post update"
            when the room sees you as gone. */}
        {state === "active" && <DeskAdminForm />}
      </section>

      {/* === Section 2: Notes inbox =========================
          Live-polling client island. Renders only when there are
          active notes (initially or after a poll brings one in).
          Polls /api/admin/notes every 10s; notes that arrived during
          the session get a brief olive highlight as they appear. */}
      <LiveAdminNotesPanel initialNotes={activeNotes} />

      {/* === Section 2.5: The Watch Feed =====================
          Live broadcast surface above the lounge chat. Used during
          host-led events (The Watch). Cards appear in members' feed
          within ~5 seconds. Collapsed by default — only relevant
          during events, but reachable at all times. */}
      <WatchFeedAdmin initialPosts={watchFeed} />

      {/* === Section 2.6: Who's in the room ==================
          Floor control for the member-facing lounge presence line.
          Self-fetching client island — shows the live count and lets
          Clay set the turnout floor below which the line stays dark. */}
      <RoomPresenceControl />

      {/* === Section 2.7: Conversation prompts ===============
          Schedule a starter + drip of host prompts that post as
          lounge posts over the night to keep the room talking. */}
      <PromptScheduler />

      {/* === Section 3: Signals ==============================
          Broadcast notifications + the active-wall override. These
          fire less often than the presence/status flow, so they're
          below the inbox — present and reachable, but not the loud
          first thing on the page. */}
      <section className="mb-14 pt-10 border-t border-rule">
        <p
          className="eyebrow mb-2"
          style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
        >
          Signals
        </p>
        <p className="font-serif italic text-ink-muted mb-6">
          Broadcasts and the active-wall override. Less frequent
          than presence; kept on this page so the whole desk
          control surface sits in one place.
        </p>

        <BroadcastForm />
        <ActiveWallControl
          initialOverride={wallOverride}
          initialWalls={wallChoices}
          initialResolvedTitle={pinnedWall?.title ?? null}
          initialIsKnown={
            wallOverride.featuredSlug ? !!pinnedWall : true
          }
        />
      </section>

    </div>
  );
}
