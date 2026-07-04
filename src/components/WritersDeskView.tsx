"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  WritersDeskState,
  FirstRunState,
  DeskPoolAsk,
} from "@/lib/writers-desk-state";
import type { PresenceState } from "@/lib/desk";
import type { PulseEvent } from "@/lib/pulse";
import type { Note } from "@/lib/notes";
import { NotePaperPanel } from "@/components/NotePaperPanel";
import { VoiceMemoCard } from "@/components/VoiceMemoCard";
import { ActiveWallPanel } from "@/components/ActiveWallPanel";
import { Linkified } from "@/components/Linkified";
import { PulseSourceGlyph } from "@/components/PulseSourceGlyph";
import { DeskLamp } from "@/components/DeskLamp";
import { GuildCrest } from "@/components/guild/GuildCrest";
import { LoungeMark } from "@/components/LoungeMark";

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

// Hard cap on a previewed snippet so one long Lounge post can't blow out
// the quote height. Pairs with line-clamp as a belt-and-suspenders guard.
function clampText(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

function replyLabel(n: number): string {
  return n === 0 ? "No replies yet" : n === 1 ? "1 reply" : `${n} replies`;
}

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

// Zone title. Deliberately heavier than the per-row kicker labels
// (darker ink, larger, wider tracking) so the eye can find where one
// section ends and the next begins instead of reading the widget as one
// flat column. Pairs with a top rule + generous space on its wrapper.
function SectionHeader({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-4">
      <h3
        className="font-display uppercase text-ink flex items-center gap-2"
        style={{
          letterSpacing: "0.24em",
          fontSize: "0.82rem",
          fontWeight: 700,
          margin: 0,
        }}
      >
        {children}
      </h3>
      {action}
    </div>
  );
}

// The pool-ask band. Sits at the foot of the participate cluster (after
// the rooms, before the low-value feeds): a waiting reader made real by
// their own note, the live pot bar, and a door into /membership/cover.
// Only renders when the state says to (someone waiting, viewer not a
// charity-seat member) — the suppression lives server-side.
function DeskPoolAskBand({ ask }: { ask: DeskPoolAsk }) {
  const money = (c: number) =>
    c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`;
  const remaining = Math.max(0, ask.seatPriceCents - ask.potCents);
  const pct = Math.max(
    0,
    Math.min(100, Math.round((ask.potCents / ask.seatPriceCents) * 100))
  );
  return (
    <div className="mt-10 pt-8 border-t border-rule">
      <SectionHeader>The seat pool</SectionHeader>
      <p
        className="font-serif text-ink leading-relaxed"
        style={{ fontSize: "1.02rem" }}
      >
        {ask.waiting === 1
          ? "Someone's waiting for a seat."
          : `${ask.waiting} readers are waiting for a seat.`}
      </p>
      {ask.note && (
        // A voice FROM the line, not the person you fund. The pool is
        // anonymous and FIFO, so the quote humanizes the queue rather than
        // promising a specific recipient — funding moves the line by one.
        <p
          className="font-serif italic text-ink-muted leading-relaxed mt-2"
          style={{ fontSize: "1rem" }}
        >
          <span className="not-italic text-ink-faint">
            {ask.waiting === 1 ? "They wrote: " : "One of them wrote: "}
          </span>
          &ldquo;{ask.note}&rdquo;
        </p>
      )}

      <div
        className="w-full mt-4 mb-2.5"
        style={{
          height: 8,
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          overflow: "hidden",
        }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="progress toward the next pooled seat"
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--eye-deep)",
            transition: "width 300ms ease",
          }}
        />
      </div>
      <p
        className="font-serif text-ink-muted"
        style={{ fontSize: "0.88rem" }}
      >
        {ask.potCents > 0 ? (
          <>
            Readers have put {money(ask.potCents)} toward the next seat.{" "}
            {money(remaining)} to go.
          </>
        ) : (
          <>A few readers together fund one. Start the next.</>
        )}
      </p>

      <div className="mt-4">
        <Link href="/membership/cover" className="btn-primary">
          <span>Cover a seat</span>
        </Link>
      </div>
    </div>
  );
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

function CheckDisc({ done }: { done: boolean }) {
  if (done) {
    return (
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "var(--eye-deep)",
          color: "var(--surface)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.62rem",
          flexShrink: 0,
        }}
      >
        &#10003;
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "1.5px solid var(--border)",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// New-member "Getting started" checklist. The one place a contained card
// earns its keep on the desk: it's a temporary, actionable element that
// should stand out, and it retires once the member is settled (finished
// or dismissed). Olive outline marks it as the thing to act on.
function FirstRunPanel({ firstRun }: { firstRun: FirstRunState }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const doneCount = firstRun.steps.filter((s) => s.done).length;
  const total = firstRun.steps.length;

  function dismiss() {
    setDismissed(true);
    fetch("/api/onboarding/dismiss", { method: "POST", cache: "no-store" }).catch(
      () => {}
    );
  }

  return (
    <div
      style={{
        marginBottom: "1.75rem",
        background: "var(--surface)",
        border: "1px solid var(--eye-deep)",
        borderRadius: 2,
        padding: "1.25rem 1.4rem 1rem",
      }}
    >
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <p
          className="font-display uppercase text-ink"
          style={{ letterSpacing: "0.2em", fontSize: "0.78rem", fontWeight: 700 }}
        >
          Getting started
        </p>
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.78rem" }}
        >
          {doneCount} of {total}
        </span>
      </div>
      <p
        className="font-serif italic text-ink-muted mb-3"
        style={{ fontSize: "0.9rem" }}
      >
        Three quick moves to settle in.
      </p>
      <ul className="flex flex-col">
        {firstRun.steps.map((s) => (
          <li
            key={s.key}
            className="py-1.5"
            style={{ borderTop: "1px solid var(--rule)" }}
          >
            {s.done ? (
              <span className="flex items-center gap-2.5">
                <CheckDisc done />
                <span
                  className="font-serif text-ink-faint"
                  style={{
                    fontSize: "0.98rem",
                    textDecoration: "line-through",
                    textDecorationColor: "var(--ink-faint)",
                  }}
                >
                  {s.label}
                </span>
              </span>
            ) : (
              <Link
                href={s.href}
                className="group flex items-center gap-2.5 no-underline"
              >
                <CheckDisc done={false} />
                <span
                  className="font-serif text-ink group-hover:text-eye-deep transition-colors"
                  style={{ fontSize: "0.98rem" }}
                >
                  {s.label}
                </span>
                <span
                  className="text-eye-deep transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                  style={{ fontSize: "0.8rem" }}
                >
                  &rarr;
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-end mt-2.5">
        <button
          type="button"
          onClick={dismiss}
          className="font-display uppercase tracking-[0.18em] text-ink-faint hover:text-ink transition-colors"
          style={{
            background: "transparent",
            border: 0,
            fontSize: "0.62rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
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
  // Dev-only preview: visit /desk?firstrun=preview to see the new-member
  // panel even as admin / an established member. Never fires in prod.
  const [previewFirstRun, setPreviewFirstRun] = useState(false);
  // Dev-only: /desk?glow=preview forces both room doorways lit so the glow
  // can be seen and tuned without gaming live presence.
  const [glowPreview, setGlowPreview] = useState(false);
  // Dev-only: /desk?poolask=preview forces the seat-pool band with sample
  // data so it can be seen without a live waiter in the dev pool.
  const [previewPoolAsk, setPreviewPoolAsk] = useState(false);
  // Persistent "view as a reader" mode (admin only). Flips every member-
  // relative surface that's normally hidden for the author — the first-run
  // checklist, the seat-pool band, NEW badges — on at once, so Clay sees
  // his desk the way a reader does without stringing preview params
  // together. Sticks across reloads (localStorage) and works in prod.
  const [asReader, setAsReader] = useState(false);
  // Latch the latest-update id we've seen so we can mount-trigger the
  // fresh-update highlight when polling brings in a new one.
  const lastUpdateId = useRef<string | null>(
    initialState.latestUpdate?.id ?? null
  );
  // Public board: phase machine so we can animate the exit instead
  // of snap-unmounting. `closed` keeps the panel out of the tree,
  // Bump `now` on a 30s tick so relative timestamps stay honest
  // between polls. Doesn't fetch anything — pure display refresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      if (process.env.NODE_ENV !== "production") {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("firstrun") === "preview") setPreviewFirstRun(true);
        if (sp.get("glow") === "preview") setGlowPreview(true);
        if (sp.get("poolask") === "preview") setPreviewPoolAsk(true);
      }
    } catch {
      // no-op
    }
  }, []);

  // Restore "view as a reader" for admin (persisted, or ?as=reader). Not
  // dev-gated — Clay QAs the member view on the live desk too.
  useEffect(() => {
    if (!initialState.isAdmin) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const stored = window.localStorage.getItem("desk-as-reader") === "1";
      if (sp.get("as") === "reader" || stored) setAsReader(true);
    } catch {
      // no-op
    }
  }, [initialState.isAdmin]);

  function toggleAsReader() {
    setAsReader((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("desk-as-reader", next ? "1" : "0");
      } catch {
        // no-op
      }
      return next;
    });
  }

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
    memberNotes,
    voiceMemo,
    activeWall,
    rooms,
    firstRun,
    poolAsk,
    isSignedIn,
    isAdmin: viewerIsAdmin,
  } = data;

  // "Lit" doorways: a room glows when it's warm. The Lounge is warm when
  // members are present right now; the Guild when a thread saw activity in
  // the last hour and a half. This is the room's open-sign, deliberately
  // NOT the green presence lamp (that one is Clay's, one of one).
  const GUILD_WARM_WINDOW_MS = 90 * 60 * 1000;
  // ?glow=preview lights only the Lounge so it sits next to the dark Guild
  // door for an at-a-glance lit-vs-unlit comparison.
  const loungeLit = glowPreview || rooms.lounge.activeNow > 0;
  const guildWarmAt = Math.max(
    rooms.guild.latest?.lastActivityAt ?? 0,
    rooms.guild.questionOfWeek?.lastActivityAt ?? 0
  );
  const guildLit = guildWarmAt > 0 && now - guildWarmAt < GUILD_WARM_WINDOW_MS;

  // The preview override (dev param or reader mode) synthesizes a fresh,
  // all-unchecked panel so Clay sees the new-member experience.
  const effectiveFirstRun: FirstRunState | null = previewFirstRun || asReader
    ? {
        steps: [
          { key: "name", label: "Set your name", href: "/notes/account", done: false },
          { key: "lounge", label: "Say hi in the Lounge", href: "/lounge", done: false },
          {
            key: "qotw",
            label: "Answer the Question of the Week",
            href: rooms.guild.questionOfWeek
              ? `/guild/${rooms.guild.questionOfWeek.id}`
              : "/guild",
            done: false,
          },
        ],
      }
    : firstRun;

  // Seat-pool band: real data when there's a live waiter, otherwise a
  // sample so the band is visible under the dev param or reader mode
  // (where the author's own desk would otherwise show nothing).
  const SAMPLE_POOL_ASK: DeskPoolAsk = {
    waiting: 3,
    note: "Old guy on SS who likes Sowell. Braver Angel with braverangels.org. Thanks 4 your work!",
    potCents: 2700,
    seatPriceCents: 3900,
  };
  const effectivePoolAsk: DeskPoolAsk | null = previewPoolAsk
    ? SAMPLE_POOL_ASK
    : poolAsk ?? (asReader ? SAMPLE_POOL_ASK : null);

  // First-time visitors (no stamp yet) and admins never see NEW
  // badges. Otherwise compare item timestamps to the frozen baseline.
  function isNewSinceLastVisit(at: number | null | undefined): boolean {
    if (asReader) {
      // Reader mode has no admin baseline, so treat the last week as new.
      return !!at && at > now - 7 * 24 * 60 * 60 * 1000;
    }
    if (viewerIsAdmin) return false;
    if (frozenLastVisitedAt === null) return false;
    if (!at) return false;
    return at > frozenLastVisitedAt;
  }

  function handleNoteSubmitted(note: Note) {
    // Optimistic prepend — the next poll will reconcile against the
    // server-authoritative list, but the user shouldn't have to wait
    // for that to see their own note appear.
    setData((prev) => {
      const nextMember = prev.memberNotes.some((n) => n.id === note.id)
        ? prev.memberNotes
        : [note, ...prev.memberNotes];
      return { ...prev, memberNotes: nextMember };
    });
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
        </div>
        <p
          className="font-serif italic text-ink-muted leading-relaxed mb-5"
          style={{ fontSize: "0.92rem" }}
        >
          Live updates from Clay&apos;s desk. Check back when the light is
          green.
        </p>

        {viewerIsAdmin && (
          <button
            type="button"
            onClick={toggleAsReader}
            className="font-display uppercase tracking-[0.2em] text-eye-deep hover:text-ink transition-colors mb-5 block"
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              fontSize: "0.62rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {asReader
              ? "● Viewing as a reader · back to admin"
              : "View this as a reader"}
          </button>
        )}

        {effectiveFirstRun && <FirstRunPanel firstRun={effectiveFirstRun} />}

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

        {/* Leave a note for Clay — sits right under his presence, since
            the note is the direct line to him. Members only on the normal
            desk (Clay works notes from /admin/notes); it also appears for
            admin under "view as a reader" as part of the member preview. */}
        {isSignedIn && (!viewerIsAdmin || asReader) && (
          <div className="mt-6">
            <NotePaperPanel
              memberNotes={memberNotes}
              onSubmitted={handleNoteSubmitted}
            />
          </div>
        )}

        {/* The rooms — the hub. Two spokes off the desk: the Guild
            (deep threads) and the Lounge (live talk). Each shows its
            own pulse so the desk answers "what's alive now" before the
            member decides where to go. Members + admin only. */}
        {isSignedIn && (
          <div className="mt-10 pt-8 border-t border-rule">
            <SectionHeader>The rooms</SectionHeader>

            {/* The Guild — the room name IS the door: name + arrow link
                straight in, so where it goes is obvious. A live preview
                of the latest thread sits beneath. */}
            <div className="mb-7">
              <Link
                href="/guild"
                className="group inline-flex items-center gap-2.5 no-underline"
              >
                <span className={guildLit ? "doorway doorway-lit" : "doorway"}>
                  <GuildCrest size={26} />
                </span>
                <span
                  className="font-display text-ink group-hover:text-eye-deep transition-colors"
                  style={{ fontSize: "1.25rem", fontWeight: 600 }}
                >
                  The Guild
                </span>
                <span
                  className="text-eye-deep transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                  style={{ fontSize: "0.95rem" }}
                >
                  &rarr;
                </span>
              </Link>
              {!rooms.guild.questionOfWeek && !rooms.guild.latest && (
                <p
                  className="font-serif italic text-ink-faint mt-1.5"
                  style={{ fontSize: "0.92rem" }}
                >
                  No open threads yet.
                </p>
              )}

              {rooms.guild.questionOfWeek && (
                <Link
                  href={`/guild/${rooms.guild.questionOfWeek.id}`}
                  className="group block no-underline mt-3.5"
                >
                  <p
                    className="eyebrow"
                    style={{
                      color: "var(--eye-deep)",
                      letterSpacing: "0.24em",
                      fontSize: "0.6rem",
                      marginBottom: "0.45rem",
                    }}
                  >
                    Question of the week
                  </p>
                  <p
                    className="font-display text-ink leading-[1.15] group-hover:text-eye-deep transition-colors"
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {rooms.guild.questionOfWeek.title}
                  </p>
                  <p
                    className="font-serif italic text-ink-faint mt-1 flex items-center gap-2"
                    style={{ fontSize: "0.78rem" }}
                  >
                    <span>
                      {replyLabel(rooms.guild.questionOfWeek.replyCount)} &middot;{" "}
                      {formatRelative(
                        rooms.guild.questionOfWeek.lastActivityAt,
                        now
                      )}
                    </span>
                    {isNewSinceLastVisit(
                      rooms.guild.questionOfWeek.lastActivityAt
                    ) && <NewBadge />}
                  </p>
                </Link>
              )}

              {rooms.guild.latest && (
                <Link
                  href={`/guild/${rooms.guild.latest.id}`}
                  className="group block no-underline mt-4"
                >
                  <p
                    className="eyebrow"
                    style={{
                      color: "var(--ink-faint)",
                      letterSpacing: "0.22em",
                      fontSize: "0.58rem",
                      marginBottom: "0.35rem",
                    }}
                  >
                    Active now
                  </p>
                  <p
                    className="font-serif italic text-ink leading-snug group-hover:text-eye-deep transition-colors"
                    style={{ fontSize: "1.02rem" }}
                  >
                    {rooms.guild.latest.title}
                  </p>
                  <p
                    className="font-serif italic text-ink-faint mt-1 flex items-center gap-2"
                    style={{ fontSize: "0.78rem" }}
                  >
                    <span>
                      {rooms.guild.latest.authorName
                        ? `${rooms.guild.latest.authorName} · `
                        : ""}
                      {replyLabel(rooms.guild.latest.replyCount)} &middot;{" "}
                      {formatRelative(rooms.guild.latest.lastActivityAt, now)}
                    </span>
                    {isNewSinceLastVisit(rooms.guild.latest.lastActivityAt) && (
                      <NewBadge />
                    )}
                  </p>
                </Link>
              )}
            </div>

            {/* The Lounge — same door pattern. Presence rides next to the
                room name (positive only, never an empty-room note) so the
                doorway itself shows life. The latest line is the preview,
                italic so it reads as something someone actually said. */}
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <Link
                  href="/lounge"
                  className="group inline-flex items-center gap-2.5 no-underline"
                >
                  <span className={loungeLit ? "doorway doorway-lit" : "doorway"}>
                    <LoungeMark size={26} />
                  </span>
                  <span
                    className="font-display text-ink group-hover:text-eye-deep transition-colors"
                    style={{ fontSize: "1.25rem", fontWeight: 600 }}
                  >
                    The Lounge
                  </span>
                  <span
                    className="text-eye-deep transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                    style={{ fontSize: "0.95rem" }}
                  >
                    &rarr;
                  </span>
                </Link>
              </div>
              {rooms.lounge.latest ? (
                <Link
                  href={`/lounge#post-${rooms.lounge.latest.id}`}
                  className="group block no-underline mt-1.5"
                >
                  <p
                    className="font-serif italic text-ink leading-snug line-clamp-2 group-hover:text-eye-deep transition-colors"
                    style={{ fontSize: "1.02rem" }}
                  >
                    &ldquo;{clampText(rooms.lounge.latest.body, 150)}&rdquo;
                  </p>
                  <p
                    className="font-serif italic text-ink-faint mt-1 flex items-center gap-2"
                    style={{ fontSize: "0.78rem" }}
                  >
                    <span>
                      {rooms.lounge.latest.firstName},{" "}
                      {formatRelative(rooms.lounge.latest.lastActivityAt, now)}
                    </span>
                    {isNewSinceLastVisit(
                      rooms.lounge.latest.lastActivityAt
                    ) && <NewBadge />}
                  </p>
                </Link>
              ) : rooms.lounge.activeNow > 0 ? (
                <p
                  className="font-serif italic text-ink-muted mt-1.5"
                  style={{ fontSize: "0.92rem" }}
                >
                  Quiet, but people are here. Say something.
                </p>
              ) : (
                <p
                  className="font-serif italic text-ink-faint mt-1.5"
                  style={{ fontSize: "0.92rem" }}
                >
                  Drop the first line.
                </p>
              )}
            </div>
          </div>
        )}

        {effectivePoolAsk && <DeskPoolAskBand ask={effectivePoolAsk} />}

        {voiceMemo && (
          <div className="mt-10 pt-8 border-t border-rule">
            <SectionHeader>
              <span>Voice from the desk</span>
              {isNewSinceLastVisit(voiceMemo.publishedAt) && <NewBadge />}
            </SectionHeader>
            <VoiceMemoCard memo={voiceMemo} now={now} />
          </div>
        )}

        {activeWall && (
          <div className="mt-10 pt-8 border-t border-rule">
            <SectionHeader>
              <span>Active wall</span>
              {isNewSinceLastVisit(activeWall.openedAt) && <NewBadge />}
            </SectionHeader>
            <ActiveWallPanel snapshot={activeWall} />
          </div>
        )}

        {recentWork.length > 0 && (
          <div className="mt-10 pt-8 border-t border-rule">
            <SectionHeader
              action={
                <Link
                  href="/notes/activity"
                  className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
                  style={{ fontSize: "0.62rem", fontWeight: 600 }}
                >
                  View all &rarr;
                </Link>
              }
            >
              At home
            </SectionHeader>
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
