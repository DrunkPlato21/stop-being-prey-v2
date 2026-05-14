"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { WritersDeskState } from "@/lib/writers-desk-state";
import type { PresenceState } from "@/lib/desk";
import type { PulseEvent } from "@/lib/pulse";
import type { Note } from "@/lib/notes";
import { NotePaperPanel } from "@/components/NotePaperPanel";
import { PublicNotesPanel } from "@/components/PublicNotesPanel";
import { VoiceMemoCard } from "@/components/VoiceMemoCard";
import { ActiveWallPanel } from "@/components/ActiveWallPanel";
import { Linkified } from "@/components/Linkified";
import { PulseSourceGlyph } from "@/components/PulseSourceGlyph";
import { DeskLamp } from "@/components/DeskLamp";

const PUBLIC_VIEWED_KEY = "sbp:public-notes-viewed-at";
// Total hold time the panel stays open after an auto-open from a
// public note submission. Includes the enter animation; the close
// animation tacks on its own ~300ms after.
const AUTO_OPEN_PUBLIC_PANEL_MS = 5300;
// Duration of the panel's closing fade-out keyframe; must match
// the CSS animation length on `.public-notes-panel-closing`.
const PUBLIC_PANEL_CLOSE_MS = 300;

// Polling cadence. Tight enough that "I just changed something in
// another tab / on my phone" registers within a few seconds, but not
// so tight that the request log fills up. Tab-visibility pauses
// polling entirely so a background tab doesn't burn requests.
const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 15_000;
// `now` tick for relative-time display. 30s is fine for "Xm ago"
// granularity without making the page feel busy.
const NOW_TICK_MS = 30_000;
// Delay before we mark this visit as "seen" on the server. Long
// enough that a fast-bounce doesn't wipe NEW badges the member never
// looked at; short enough that the badges actually persist for the
// member's reading session before being cleared next visit.
const MARK_VISITED_DELAY_MS = 5_000;

function formatRelative(at: number, now: number): string {
  const diff = now - at;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const date = new Date(at);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Small notebook silhouette. Same single-stroke outline vocabulary
// as the lamp icon so the two read as a pair on the widget header.
function NotebookIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="6.5" y1="3" x2="6.5" y2="21" />
      <rect x="6.5" y="3" width="12.5" height="18" rx="0.5" />
      <line x1="10" y1="8" x2="16" y2="8" />
      <line x1="10" y1="12" x2="16" y2="12" />
      <line x1="10" y1="16" x2="14" y2="16" />
    </svg>
  );
}

// Banker's-lamp silhouette. Single-stroke outline. Picks up the gold
// (Glyph extracted to @/components/DeskLamp so the chrome's site-wide
// presence indicator renders the same lamp without drift.)

function PresenceLine({
  state,
  endedAt,
  lastActivityAt,
  now,
}: {
  state: PresenceState;
  endedAt: number;
  lastActivityAt: number;
  now: number;
}) {
  const dotClass =
    state === "active"
      ? "desk-status-dot desk-status-dot-active"
      : state === "manually-away"
        ? "desk-status-dot desk-status-dot-recent"
        : "desk-status-dot desk-status-dot-quiet";

  let label: string;
  if (state === "active") {
    label = "Clay is at the desk";
  } else if (state === "manually-away") {
    label = `Clay is away from the desk. Last seen ${formatRelative(
      endedAt,
      now
    )}`;
  } else if (lastActivityAt > 0) {
    label = `Clay stepped away. Last active ${formatRelative(
      lastActivityAt,
      now
    )}`;
  } else {
    label = "Clay stepped away.";
  }

  return (
    <div className="flex items-center gap-3">
      <span className={dotClass} aria-hidden="true" />
      <span
        className="font-display uppercase text-ink"
        style={{
          fontSize: "0.78rem",
          letterSpacing: "0.22em",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
    </div>
  );
}

// Glyph extracted to its own file so the archive pages
// (/notes/activity, /notes/elsewhere) can reuse the same vocabulary.

// Small olive pill marking content the viewer hasn't seen yet. Pinned
// next to the source label or section eyebrow, never the body text.
function NewBadge() {
  return <span className="desk-new-badge">New</span>;
}

function PulseRow({
  event,
  now,
  isNew,
  compact = false,
}: {
  event: PulseEvent;
  now: number;
  isNew: boolean;
  /** Reduced visual prominence: smaller body, dimmer source label.
      Used by the Elsewhere lane to signal "supplementary". */
  compact?: boolean;
}) {
  const inner = (
    <div className="flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <p
          className="eyebrow mb-1 flex items-center gap-1.5"
          style={{
            letterSpacing: "0.22em",
            fontSize: "0.6rem",
            opacity: compact ? 0.72 : 1,
          }}
        >
          <PulseSourceGlyph source={event.source} />
          <span>{event.label}</span>
          {isNew && <NewBadge />}
        </p>
        <p
          className="font-serif text-ink leading-relaxed truncate"
          style={{ fontSize: compact ? "0.87rem" : "0.95rem" }}
        >
          {event.body}
        </p>
      </div>
      <span
        className="font-serif italic text-ink-faint shrink-0"
        style={{ fontSize: compact ? "0.74rem" : "0.78rem" }}
      >
        {formatRelative(event.at, now)}
      </span>
    </div>
  );

  if (event.link?.startsWith("/")) {
    return (
      <Link
        href={event.link}
        className="block no-underline hover:text-eye-deep transition-colors"
      >
        {inner}
      </Link>
    );
  }
  if (event.link) {
    return (
      <a
        href={event.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block no-underline hover:text-eye-deep transition-colors"
      >
        {inner}
      </a>
    );
  }
  return inner;
}

export function WritersDeskView({
  initialState,
}: {
  initialState: WritersDeskState;
}) {
  const [data, setData] = useState<WritersDeskState>(initialState);
  const [now, setNow] = useState<number>(() => Date.now());
  // Frozen at mount on purpose. The state-poll endpoint returns the
  // *current* server-side last-visited stamp on every call, but we
  // want the NEW badges to stay visible for this session even after
  // we bump the stamp via mark-visited. So we compute badges against
  // this snapshot only.
  const [frozenLastVisitedAt] = useState<number | null>(
    initialState.lastVisitedAt
  );
  // Latch the latest-update id we've seen so we can mount-trigger the
  // fresh-update highlight when polling brings in a new one.
  const lastUpdateId = useRef<string | null>(
    initialState.latestUpdate?.id ?? null
  );
  // Public board: phase machine so we can animate the exit instead
  // of snap-unmounting. `closed` keeps the panel out of the tree,
  // `open` mounts it (CSS plays the enter animation on first paint),
  // `closing` keeps it mounted while the exit keyframe runs.
  const [publicPanelPhase, setPublicPanelPhase] = useState<
    "closed" | "open" | "closing"
  >("closed");
  // ID of the note that should get the "freshly landed" highlight
  // animation when the panel auto-opens after a submission. Cleared
  // once the panel fully closes so the same note isn't re-flashed
  // on a later open.
  const [freshNoteId, setFreshNoteId] = useState<string | null>(null);
  const [lastViewedAt, setLastViewedAt] = useState<number>(0);
  const autoCloseTimer = useRef<number | null>(null);
  const closeAnimTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PUBLIC_VIEWED_KEY);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) setLastViewedAt(parsed);
      }
    } catch {
      // Storage blocked — badge will always show until they open once.
    }
  }, []);

  useEffect(() => {
    return () => {
      if (autoCloseTimer.current !== null) {
        window.clearTimeout(autoCloseTimer.current);
      }
      if (closeAnimTimer.current !== null) {
        window.clearTimeout(closeAnimTimer.current);
      }
    };
  }, []);

  function clearTimers() {
    if (autoCloseTimer.current !== null) {
      window.clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }
    if (closeAnimTimer.current !== null) {
      window.clearTimeout(closeAnimTimer.current);
      closeAnimTimer.current = null;
    }
  }

  function openPublicPanel(autoClose = false, fresh?: string) {
    clearTimers();
    setPublicPanelPhase("open");
    if (fresh) setFreshNoteId(fresh);
    const stamp = Date.now();
    try {
      window.localStorage.setItem(PUBLIC_VIEWED_KEY, String(stamp));
    } catch {
      // ignore
    }
    setLastViewedAt(stamp);
    if (autoClose) {
      autoCloseTimer.current = window.setTimeout(() => {
        beginClose();
      }, AUTO_OPEN_PUBLIC_PANEL_MS);
    }
  }

  function beginClose() {
    setPublicPanelPhase("closing");
    if (autoCloseTimer.current !== null) {
      window.clearTimeout(autoCloseTimer.current);
      autoCloseTimer.current = null;
    }
    closeAnimTimer.current = window.setTimeout(() => {
      setPublicPanelPhase("closed");
      setFreshNoteId(null);
      closeAnimTimer.current = null;
    }, PUBLIC_PANEL_CLOSE_MS);
  }

  function closePublicPanel() {
    if (publicPanelPhase === "closing" || publicPanelPhase === "closed") {
      return;
    }
    beginClose();
  }

  // Bump `now` on a 30s tick so relative timestamps stay honest
  // between polls. Doesn't fetch anything — pure display refresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Mark this visit as seen on the server after a short delay. We use
  // initialState here rather than `data` so this fires once per page
  // load, not on every poll-induced re-render.
  useEffect(() => {
    if (!initialState.isSignedIn || initialState.isAdmin) return;
    const id = window.setTimeout(() => {
      fetch("/api/writers-desk/mark-visited", {
        method: "POST",
        cache: "no-store",
      }).catch(() => {
        // Network blip — next page load will retry. The frozen client
        // snapshot still keeps the right badges on screen this session.
      });
    }, MARK_VISITED_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [initialState.isSignedIn, initialState.isAdmin]);

  // Polling loop. Re-runs when the derived state flips so the
  // interval can lengthen (active 10s → idle 30s) or shorten.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/writers-desk/state", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as WritersDeskState;
        if (cancelled) return;
        setData(next);
        setNow(Date.now());
      } catch {
        // Network blip — try again on the next tick.
      }
    }

    function schedule() {
      const interval =
        data.state === "active" ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timer = window.setTimeout(async () => {
        await poll();
        if (!cancelled) schedule();
      }, interval);
    }
    schedule();

    function onVisibility() {
      if (!document.hidden) {
        // Tab regained focus — pull a fresh snapshot immediately
        // instead of waiting for the next scheduled poll.
        poll();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [data.state]);

  const {
    presence,
    state,
    latestUpdate,
    awayNote,
    recentWork,
    elsewhere,
    memberNotes,
    publicNotes,
    voiceMemo,
    activeWall,
    isSignedIn,
    isAdmin: viewerIsAdmin,
  } = data;

  // First-time visitors (no stamp yet) and admins never see NEW
  // badges. Otherwise compare item timestamps to the frozen baseline.
  function isNewSinceLastVisit(at: number | null | undefined): boolean {
    if (viewerIsAdmin) return false;
    if (frozenLastVisitedAt === null) return false;
    if (!at) return false;
    return at > frozenLastVisitedAt;
  }

  // Newest timestamp across publicNotes (created or replied). The
  // badge fires when this is past the per-device last-viewed stamp.
  let newestPublicActivity = 0;
  for (const n of publicNotes) {
    if (n.createdAt > newestPublicActivity) newestPublicActivity = n.createdAt;
    if (n.clayRepliedAt && n.clayRepliedAt > newestPublicActivity) {
      newestPublicActivity = n.clayRepliedAt;
    }
  }
  const hasNewPublic =
    publicNotes.length > 0 && newestPublicActivity > lastViewedAt;
  const showNotebookIcon = publicNotes.length > 0;

  function handleNoteSubmitted(note: Note) {
    // Optimistic prepend — the next poll will reconcile against the
    // server-authoritative list, but the user shouldn't have to wait
    // for that to see their own note appear.
    setData((prev) => {
      const nextMember = prev.memberNotes.some((n) => n.id === note.id)
        ? prev.memberNotes
        : [note, ...prev.memberNotes];
      const nextPublic =
        note.visibility === "public" &&
        !prev.publicNotes.some((n) => n.id === note.id)
          ? [note, ...prev.publicNotes]
          : prev.publicNotes;
      return { ...prev, memberNotes: nextMember, publicNotes: nextPublic };
    });

    // Public submissions briefly auto-open the public panel so the
    // member sees their note land on the board. The note id flows to
    // the panel so the just-submitted entry gets the "freshly landed"
    // gold-tint settle animation as it appears.
    if (note.visibility === "public") {
      openPublicPanel(true, note.id);
    }
  }
  // Apply the fresh-update animation when a new update id rolls in
  // via polling AND Clay is currently active. Re-mount the node so
  // the CSS keyframe runs on this turn only.
  const isFreshNewUpdate =
    state === "active" &&
    latestUpdate &&
    latestUpdate.id !== lastUpdateId.current;
  if (latestUpdate && lastUpdateId.current !== latestUpdate.id) {
    lastUpdateId.current = latestUpdate.id;
  }

  return (
    <section className="relative bg-surface border border-border overflow-hidden">
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye z-10" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye z-10" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye z-10" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye z-10" />

      {publicPanelPhase !== "closed" && (
        <PublicNotesPanel
          notes={publicNotes}
          onClose={closePublicPanel}
          phase={publicPanelPhase}
          freshNoteId={freshNoteId}
        />
      )}

      <div className="relative z-[1] px-6 sm:px-8 py-7">
        <div className="flex items-center gap-2.5 mb-2">
          <DeskLamp lit={state === "active"} />
          <p
            className="eyebrow"
            style={{
              letterSpacing: "0.32em",
              fontSize: "0.7rem",
              margin: 0,
            }}
          >
            Writer&apos;s Desk
          </p>
          {showNotebookIcon && (
            <button
              type="button"
              onClick={() => openPublicPanel(false)}
              aria-label={`View public notes (${publicNotes.length})`}
              title="View all public notes from Clay's readers."
              className="desk-notebook-button ml-auto"
            >
              <span className="desk-notebook-icon-wrap">
                <NotebookIcon />
                {hasNewPublic && (
                  <span
                    className="desk-notebook-badge"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="desk-notebook-label">Notes</span>
              <span className="desk-notebook-sep" aria-hidden="true">
                ·
              </span>
              <span className="desk-notebook-count">
                {publicNotes.length}
              </span>
            </button>
          )}
        </div>
        <p
          className="font-serif italic text-ink-muted leading-relaxed mb-5"
          style={{ fontSize: "0.92rem" }}
        >
          Live updates from Clay&apos;s desk. Check back when the light is
          green.
        </p>

        {/* Status panel — the focal point of the widget. The lamp
            light concentrates ON this panel (not the whole widget),
            tying the desk metaphor literally: the lamp illuminates
            the surface where Clay actually is. */}
        <div className="status-panel" data-state={state}>
          {state === "active" && (
            <div className="status-panel-glow" aria-hidden="true" />
          )}
          <div className="status-panel-content">
            <PresenceLine
              state={state}
              endedAt={presence.endedAt}
              lastActivityAt={presence.lastActivityAt}
              now={now}
            />

            {awayNote && (
              <p
                className="font-serif italic text-ink-muted leading-relaxed mt-3 pl-[1.5rem]"
                style={{ fontSize: "0.98rem" }}
              >
                &ldquo;{awayNote}&rdquo;
              </p>
            )}

            {state === "active" && latestUpdate && (
              <div
                key={latestUpdate.id}
                className={
                  "mt-4 pl-[1.5rem]" +
                  (isFreshNewUpdate ? " desk-update-fresh" : "")
                }
              >
                <p
                  className="font-serif text-ink leading-relaxed whitespace-pre-wrap mb-1"
                  style={{ fontSize: "1rem" }}
                >
                  <Linkified text={latestUpdate.body} />
            </p>
            <p
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.78rem" }}
            >
                  {formatRelative(latestUpdate.createdAt, now)}
                </p>
              </div>
            )}
          </div>
        </div>

        {voiceMemo && (
          <div className="mt-7">
            <p
              className="eyebrow mb-3 flex items-center gap-2"
              style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
            >
              <span>Voice from the desk</span>
              {isNewSinceLastVisit(voiceMemo.publishedAt) && <NewBadge />}
            </p>
            <VoiceMemoCard memo={voiceMemo} now={now} />
          </div>
        )}

        {activeWall && (
          <div className="mt-7">
            <p
              className="eyebrow mb-3 flex items-center gap-2"
              style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
            >
              <span>Active wall</span>
              {isNewSinceLastVisit(activeWall.openedAt) && <NewBadge />}
            </p>
            <ActiveWallPanel snapshot={activeWall} />
          </div>
        )}

        {recentWork.length > 0 && (
          <div className="mt-9 pt-6 border-t border-rule">
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <p
                className="eyebrow"
                style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
              >
                At home
              </p>
              <Link
                href="/notes/activity"
                className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontSize: "0.62rem", fontWeight: 600 }}
              >
                View all &rarr;
              </Link>
            </div>
            <ul className="flex flex-col">
              {recentWork.map((event, idx) => (
                <li
                  key={`rw-${event.source}-${event.at}-${idx}`}
                  className={idx === 0 ? "py-2" : "py-2 border-t border-rule"}
                >
                  <PulseRow
                    event={event}
                    now={now}
                    isNew={isNewSinceLastVisit(event.at)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Out in the world — social-channel echoes. Lower visual
            weight on purpose: compact rows, dimmer source label,
            tighter vertical padding. Sits directly below At Home and
            shares the same airspace — no rule between them, the
            typographic header carries the section break. */}
        {elsewhere.length > 0 && (
          <div
            className={
              recentWork.length > 0
                ? "mt-8"
                : "mt-9 pt-6 border-t border-rule"
            }
          >
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <p
                className="eyebrow"
                style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
              >
                Out in the world
              </p>
              <Link
                href="/notes/elsewhere"
                className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontSize: "0.62rem", fontWeight: 600 }}
              >
                View all &rarr;
              </Link>
            </div>
            <ul className="flex flex-col">
              {elsewhere.map((event, idx) => (
                <li
                  key={`el-${event.source}-${event.at}-${idx}`}
                  className={
                    idx === 0
                      ? "py-1.5"
                      : "py-1.5 border-t border-rule"
                  }
                >
                  <PulseRow
                    event={event}
                    now={now}
                    isNew={isNewSinceLastVisit(event.at)}
                    compact
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Member-to-Clay notes. The "paper in a slot" affordance
            sits at the bottom of the widget so the surface reads as
            a desk with a notepad tucked in. Hidden for the admin
            viewer (Clay uses /admin/notes instead) and for anonymous
            visitors. */}
        {isSignedIn && !viewerIsAdmin && (
          <NotePaperPanel
            memberNotes={memberNotes}
            onSubmitted={handleNoteSubmitted}
          />
        )}

        {/* Admin viewer: quiet link into the moderation queue. */}
        {viewerIsAdmin && (
          <div className="mt-7 pt-5 border-t border-rule text-center">
            <Link
              href="/admin/notes"
              className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
              style={{ fontSize: "0.7rem", fontWeight: 600 }}
            >
              Notes queue &rarr;
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
