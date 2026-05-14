import Link from "next/link";
import type { Metadata } from "next";
import {
  derivePresenceState,
  getActiveAwayNote,
  getPresence,
  listRecentUpdates,
} from "@/lib/desk";
import { getWallOverride } from "@/lib/active-wall";
import { getAllWalls } from "@/lib/walls";
import { listRecentVisitorsEnriched } from "@/lib/desk-visits";
import { listAll } from "@/lib/notes";
import {
  ActiveWallControl,
  DeskAdminForm,
  DeleteDeskUpdateButton,
  PresenceToggle,
} from "@/components/DeskAdminForm";
import { BroadcastForm } from "@/components/BroadcastForm";
import { OnTheDeskBadge } from "@/components/OnTheDeskBadge";
import { AdminNoteRow } from "@/components/AdminNoteRow";
import { Linkified } from "@/components/Linkified";

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
// bottom without competing for attention with the cross-admin nav:
//
//   1. Right now      presence toggle + status composer + latest
//                     status. This is Clay's day-to-day control.
//   2. Notes inbox    member notes from the desk, prioritised when
//                     any are unread. Renders only when active notes
//                     exist; "Jump to all" link drops into /admin/notes.
//   3. Signals        broadcast form + active wall override. Less
//                     frequent actions; kept below the inbox.
//
// A quiet "Jump to" cluster at the bottom links to other admin
// surfaces (voice memos, channels, comments, members, etc.) so the
// nav is reachable without dominating the page.

const VISITOR_WINDOW_MINUTES = 30;
const VISITOR_LIMIT = 20;

export default async function DeskAdminPage() {
  const now = Date.now();
  const visitorSinceMs = now - VISITOR_WINDOW_MINUTES * 60 * 1000;
  const [updates, presence, activeNotes, wallOverride, visitorsPage] =
    await Promise.all([
      listRecentUpdates(1),
      getPresence(),
      listAll({ status: "active", limit: 50 }),
      getWallOverride(),
      listRecentVisitorsEnriched(visitorSinceMs, {
        limit: VISITOR_LIMIT,
        now,
      }),
    ]);
  const recentVisitors = visitorsPage.visitors;
  const visitorsTotal = visitorsPage.totalCount;
  const current = updates[0];
  const state = derivePresenceState(presence);
  const awayNote = getActiveAwayNote(presence) ?? "";
  const newNotesCount = activeNotes.filter((n) => n.status === "new").length;

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
          Title + live visitor badge. Cross-admin "Jump to" nav
          sits directly below as quiet small-caps so it's reachable
          without dominating the page. The dark-mode toggle lives
          in the layout-level fixed corner, not in this masthead. */}
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
        <OnTheDeskBadge
          initialVisitors={recentVisitors}
          initialTotalCount={visitorsTotal}
          windowMinutes={VISITOR_WINDOW_MINUTES}
          generatedAt={now}
        />
      </header>

      {/* === Jump to (top) ===================================
          Quiet small-caps row pinned beneath the masthead. Reads
          as utility nav, not a primary action; doesn't compete
          with the section eyebrows below. */}
      <nav
        aria-label="Other admin surfaces"
        className="mb-12 pb-6 border-b border-rule flex flex-wrap items-baseline gap-x-2 gap-y-2"
      >
        <span
          className="eyebrow mr-3"
          style={{ letterSpacing: "0.32em", fontSize: "0.6rem" }}
        >
          Jump to
        </span>
        <AdminJumpLink href="/admin/desk/voice" label="Voice memos" />
        <span className="text-ink-faint" aria-hidden="true">
          &middot;
        </span>
        <AdminJumpLink href="/admin/channels" label="Elsewhere" />
        <span className="text-ink-faint" aria-hidden="true">
          &middot;
        </span>
        <AdminJumpLink href="/admin/case-submissions" label="Case submissions" />
        <span className="text-ink-faint" aria-hidden="true">
          &middot;
        </span>
        <AdminJumpLink href="/admin/lounge" label="Lounge" />
        <span className="text-ink-faint" aria-hidden="true">
          &middot;
        </span>
        <AdminJumpLink href="/admin/lounge/moderation" label="Lounge log" />
        <span className="text-ink-faint" aria-hidden="true">
          &middot;
        </span>
        <AdminJumpLink href="/admin/book" label="Book" />
        <span className="hidden sm:inline-block w-px h-4 self-center bg-rule mx-2" aria-hidden="true" />
        <AdminJumpLink href="/admin/comments" label="Comments" />
        <span className="text-ink-faint" aria-hidden="true">
          &middot;
        </span>
        <AdminJumpLink href="/admin/members" label="Members" />
      </nav>

      {/* === Section 1: Right now ==========================
          Day-to-day control surface. Presence toggle + status
          composer + the latest status note all live together so
          the primary flow ("am I in? what'd I just say?") reads
          as one block. */}
      <section className="mb-14">
        <p
          className="eyebrow mb-2"
          style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
        >
          Right now
        </p>
        <p className="font-serif italic text-ink-muted mb-6">
          Flip presence, drop a short status. Newest pinned to the
          top of the Writer&apos;s Desk widget.
        </p>

        <PresenceToggle
          initialState={state}
          initialActive={presence.active}
          initialAwayNote={awayNote}
        />

        <DeskAdminForm />

        {current && (
          <div
            className="mt-10 pt-6 border-t border-rule flex items-start justify-between gap-4"
          >
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
        )}
      </section>

      {/* === Section 2: Notes inbox =========================
          Renders only when there are active notes. Wrapped in a
          card with paper-deep fill + olive rule so it reads as a
          self-contained inbox surface, not as page-flow content.
          Promoted above "Signals" so unread member notes are the
          next thing Clay sees after the control block. */}
      {activeNotes.length > 0 && (
        <section className="mb-14">
          <div
            className="border border-rule p-6 md:p-8"
            style={{ background: "var(--paper-deep)" }}
          >
            <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
              <p
                className="eyebrow"
                style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
              >
                Notes inbox
              </p>
              <Link
                href="/admin/notes"
                className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontSize: "0.65rem", fontWeight: 600 }}
              >
                manage all &rarr;
              </Link>
            </div>
            <p
              className="font-serif italic text-ink-muted mb-6"
              style={{ fontSize: "0.9rem" }}
            >
              {newNotesCount > 0
                ? `${newNotesCount} new · ${activeNotes.length} active`
                : `${activeNotes.length} active · no new ones`}
            </p>

            <ul className="flex flex-col">
              {activeNotes.map((note, idx) => (
                <li
                  key={note.id}
                  className={
                    idx === 0
                      ? "py-5"
                      : "py-5 border-t border-rule"
                  }
                >
                  <AdminNoteRow note={note} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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

function AdminJumpLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="font-display uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
      style={{ fontSize: "0.66rem", fontWeight: 500 }}
    >
      {label}
    </Link>
  );
}
