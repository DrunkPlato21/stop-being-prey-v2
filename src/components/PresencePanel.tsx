"use client";

import { useEffect, useRef, useState } from "react";

// Live-polling panel for /admin/presence. Receives a server-rendered
// initial snapshot and refreshes itself every POLL_INTERVAL_MS so the
// counts, the section breakdown and the member list all stay current
// without Clay having to refresh the page. Pauses while the tab is
// hidden so we don't hammer the API in the background. Mirrors the
// shape of OnTheDeskBadge but at panel-scale.

type Entry = {
  email: string;
  displayName: string | null;
  path: string;
  section: { id: string; label: string };
  lastSeenAt: number;
};

type SectionCount = {
  section: { id: string; label: string };
  count: number;
};

type Snapshot = {
  entries: Entry[];
  sections: SectionCount[];
  windowMinutes: number;
  generatedAt: number;
};

type ApiResponse = Partial<Snapshot> & { ok?: boolean };

// 60s — admin-only panel; faster polling burns Redis budget for no
// material UX gain (Clay doesn't need member presence updated every
// 20 seconds). See the rate-limit incident on 2026-05-18.
const POLL_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 15_000;

function formatRelativeAgo(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function displayFor(e: Entry): string {
  if (e.displayName) return e.displayName;
  const local = e.email.split("@")[0];
  return local || e.email;
}

function truncatePath(p: string, max = 40): string {
  if (p.length <= max) return p;
  return p.slice(0, max - 1) + "…";
}

export function PresencePanel({
  initialEntries,
  initialSections,
  initialGeneratedAt,
  windowMinutes,
}: {
  initialEntries: Entry[];
  initialSections: SectionCount[];
  initialGeneratedAt: number;
  windowMinutes: number;
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [sections, setSections] = useState<SectionCount[]>(initialSections);
  const [stampedAt, setStampedAt] = useState<number>(initialGeneratedAt);
  const [now, setNow] = useState<number>(initialGeneratedAt);
  const [pending, setPending] = useState(false);
  const cancelledRef = useRef(false);

  // Tick the relative-time formatter so "Xs ago" stays current.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, []);

  // Background poll: keep the panel live. Pauses when hidden, catches
  // up immediately on visibility return.
  useEffect(() => {
    cancelledRef.current = false;
    let timer: number | null = null;

    async function refresh() {
      try {
        setPending(true);
        const res = await fetch(
          `/api/admin/presence?window=${windowMinutes}`,
          { cache: "no-store" }
        );
        const data: ApiResponse = await res.json().catch(() => ({}));
        if (cancelledRef.current) return;
        if (res.ok && data.ok) {
          if (Array.isArray(data.entries)) setEntries(data.entries);
          if (Array.isArray(data.sections)) setSections(data.sections);
          setStampedAt(
            typeof data.generatedAt === "number"
              ? data.generatedAt
              : Date.now()
          );
          setNow(Date.now());
        }
      } catch {
        // Network blip — keep the last snapshot on screen.
      } finally {
        if (!cancelledRef.current) setPending(false);
      }
    }

    function start() {
      if (timer !== null) return;
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, POLL_INTERVAL_MS);
    }
    function stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelledRef.current = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [windowMinutes]);

  const total = entries.length;
  const sectionsWithCount = sections.filter((s) => s.count > 0);
  const dotColor = total > 0 ? "var(--eye-deep)" : "rgba(138, 125, 32, 0.35)";

  return (
    <div className="flex flex-col gap-12 md:gap-14">
      {/* === Hero count ====================================
           Magazine-style anchor: one giant numeral, a single
           line of context underneath, a small "as of …" stamp
           tucked at the bottom. */}
      <section
        className="px-6 py-10 md:px-12 md:py-14 text-center"
        style={{
          background: "var(--paper-deep)",
          border: "1px solid var(--rule)",
        }}
      >
        <div
          className="inline-flex items-center gap-3 mb-4"
          aria-hidden="true"
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: dotColor,
              boxShadow:
                total > 0
                  ? "0 0 0 4px rgba(138, 125, 32, 0.18)"
                  : "none",
            }}
          />
          <p
            className="eyebrow"
            style={{ fontSize: "0.66rem", letterSpacing: "0.32em", margin: 0 }}
          >
            On the site now
          </p>
        </div>
        <p
          className="font-display text-ink mx-auto"
          style={{
            fontSize: "clamp(4rem, 12vw, 8rem)",
            lineHeight: 0.95,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            margin: 0,
          }}
        >
          {total}
        </p>
        <p
          className="font-serif italic text-ink-muted mt-4"
          style={{ fontSize: "1rem", lineHeight: 1.5 }}
        >
          {total === 0
            ? "Nobody's here right now."
            : total === 1
              ? `1 member in the last ${windowMinutes} minutes.`
              : `${total} members in the last ${windowMinutes} minutes.`}
        </p>
        <p
          className="ui-sans text-ink-faint mt-3"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.02em",
          }}
        >
          {pending ? "refreshing…" : `as of ${formatRelativeAgo(stampedAt, now)} · auto-refreshing`}
        </p>
      </section>

      {/* === Section breakdown ==============================
           Leaderboard-style list: section label, dotted leader,
           count. Sections with zero members in the window are
           hidden — keeps the eye on what's live. */}
      {sectionsWithCount.length > 0 && (
        <section>
          <p
            className="eyebrow mb-5"
            style={{ fontSize: "0.66rem", letterSpacing: "0.32em" }}
          >
            Where they are
          </p>
          <ul className="flex flex-col">
            {sectionsWithCount.map((s, idx) => (
              <li
                key={s.section.id}
                className={
                  "flex items-baseline gap-3 py-3 " +
                  (idx === 0 ? "" : "border-t border-rule")
                }
              >
                <span
                  className="font-serif text-ink"
                  style={{ fontSize: "1.05rem" }}
                >
                  {s.section.label}
                </span>
                <span
                  aria-hidden="true"
                  className="flex-1"
                  style={{
                    borderBottom: "1px dotted var(--rule)",
                    transform: "translateY(-0.32rem)",
                  }}
                />
                <span
                  className="font-display text-ink"
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    minWidth: "1.5rem",
                    textAlign: "right",
                  }}
                >
                  {s.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* === Member list ====================================
           One row per present member, newest first. Display
           name leads, section + path follows in a quieter
           register, and a relative-time stamp lives at the
           right edge. */}
      {entries.length > 0 && (
        <section>
          <p
            className="eyebrow mb-5"
            style={{ fontSize: "0.66rem", letterSpacing: "0.32em" }}
          >
            Who's here
          </p>
          <ul className="flex flex-col">
            {entries.map((e, idx) => (
              <li
                key={e.email}
                className={
                  "py-4 flex items-start justify-between gap-4 " +
                  (idx === 0 ? "" : "border-t border-rule")
                }
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="font-serif text-ink"
                    style={{ fontSize: "1.05rem", lineHeight: 1.35 }}
                    title={e.email}
                  >
                    {displayFor(e)}
                  </p>
                  <p
                    className="ui-sans text-ink-muted mt-1"
                    style={{
                      fontSize: "0.74rem",
                      letterSpacing: "0.02em",
                      lineHeight: 1.4,
                    }}
                    title={e.path}
                  >
                    <span
                      className="text-eye-deep"
                      style={{ fontWeight: 600 }}
                    >
                      {e.section.label}
                    </span>
                    <span className="mx-2 text-ink-faint" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono">{truncatePath(e.path)}</span>
                  </p>
                </div>
                <span
                  className="ui-sans text-ink-muted whitespace-nowrap"
                  style={{
                    fontSize: "0.74rem",
                    letterSpacing: "0.02em",
                    paddingTop: "0.15rem",
                  }}
                >
                  {formatRelativeAgo(e.lastSeenAt, now)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
