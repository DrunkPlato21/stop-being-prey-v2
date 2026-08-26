"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Compact "on the site" indicator that lives in the page title row
// on /admin/desk. Renders as a small dot + total count + label; on
// hover (or click on touch) it expands a portal'd popover with a
// per-section breakdown and the recent member list — same data the
// full /admin/presence panel uses, just condensed into a card.
//
// Source of truth: /api/admin/presence?window=N. Initial paint is
// server-rendered via the initial* props.

type Entry = {
  email: string;
  displayName: string | null;
  path: string;
  /** Human name for an id-shaped path (a bout or thread title), when
      the server could resolve one. Absent means show the path. */
  label?: string | null;
  section: { id: string; label: string };
  lastSeenAt: number;
};

type ApiResponse = {
  ok?: boolean;
  entries?: Entry[];
  windowMinutes?: number;
  generatedAt?: number;
};

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 280;
// 60s — admin-only badge; see PresencePanel for the rationale.
const POLL_INTERVAL_MS = 60_000;

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

// Now clips a resolved name as well as a path, so it lost the "Path"
// in its name. Same ellipsis either way; the full value stays on the
// row's title attribute.
function truncate(p: string, max = 32): string {
  if (p.length <= max) return p;
  return p.slice(0, max - 1) + "…";
}

type AnchorPos = { top: number; right: number };

export function OnTheSiteBadge({
  initialEntries,
  windowMinutes,
  generatedAt,
}: {
  initialEntries: Entry[];
  windowMinutes: number;
  generatedAt: number;
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [stampedAt, setStampedAt] = useState<number>(generatedAt);
  const [now, setNow] = useState<number>(generatedAt);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<AnchorPos | null>(null);
  const [pending, setPending] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Anchor popover to trigger
  useEffect(() => {
    if (!open) return;
    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Background poll so the count stays live without needing to hover.
  // Pauses when the tab is hidden, catches up on visibility return.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function refresh() {
      try {
        setPending(true);
        const res = await fetch(
          `/api/admin/presence?window=${windowMinutes}`,
          { cache: "no-store" }
        );
        const data: ApiResponse = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.ok) {
          if (Array.isArray(data.entries)) setEntries(data.entries);
          setStampedAt(
            typeof data.generatedAt === "number" ? data.generatedAt : Date.now()
          );
          setNow(Date.now());
        }
      } catch {
        // Network blip — keep the last snapshot.
      } finally {
        if (!cancelled) setPending(false);
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
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [windowMinutes]);

  // Tick relative-time formatter while open
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [open]);

  // Click outside + Escape close
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function clearOpenTimer() {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }
  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function handleEnter() {
    clearCloseTimer();
    if (open) return;
    clearOpenTimer();
    openTimerRef.current = window.setTimeout(() => {
      setOpen(true);
      openTimerRef.current = null;
    }, HOVER_OPEN_DELAY_MS);
  }
  function handleLeave() {
    clearOpenTimer();
    if (!open) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      clearOpenTimer();
      clearCloseTimer();
    };
  }, []);

  const total = entries.length;
  const summary =
    total === 0
      ? `0 members on the site in the last ${windowMinutes} min`
      : total === 1
        ? `1 member on the site in the last ${windowMinutes} min`
        : `${total} members on the site in the last ${windowMinutes} min`;
  const dotColor =
    total > 0 ? "var(--eye-deep)" : "rgba(138, 125, 32, 0.35)";

  const popover =
    open && mounted && pos !== null
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Members on the site"
            onMouseEnter={() => {
              clearCloseTimer();
            }}
            onMouseLeave={handleLeave}
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 1000,
              minWidth: 280,
              maxWidth: "min(380px, calc(100vw - 16px))",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              boxShadow: "0 6px 22px rgba(26, 23, 20, 0.12)",
            }}
          >
            <header
              className="px-4 py-3 border-b border-rule flex items-center justify-between gap-4"
              style={{ background: "var(--paper-deep)" }}
            >
              <p
                className="eyebrow"
                style={{ fontSize: "0.62rem", letterSpacing: "0.32em" }}
              >
                On the site
              </p>
              <span
                className="ui-sans text-ink-muted"
                style={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.02em",
                }}
              >
                {pending
                  ? "refreshing…"
                  : `as of ${formatRelativeAgo(stampedAt, now)}`}
              </span>
            </header>

            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {total === 0 ? (
                <p
                  className="font-serif italic text-ink-faint px-4 py-4 leading-relaxed"
                  style={{ fontSize: "0.9rem" }}
                >
                  Nobody&apos;s here in the last {windowMinutes} min.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {entries.map((e, idx) => (
                    <li
                      key={e.email}
                      className={
                        "px-4 py-2.5 flex items-center justify-between gap-3 " +
                        (idx === 0 ? "" : "border-t border-rule")
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-serif text-ink truncate"
                          style={{ fontSize: "0.92rem", lineHeight: 1.3 }}
                          title={e.email}
                        >
                          {displayFor(e)}
                        </p>
                        <p
                          className="ui-sans text-ink-muted truncate"
                          style={{
                            fontSize: "0.68rem",
                            letterSpacing: "0.02em",
                            marginTop: "0.15rem",
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
                          <span
                            className="mx-1.5 text-ink-faint"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          {e.label ? (
                            <span>{truncate(e.label, 34)}</span>
                          ) : (
                            <span className="font-mono">
                              {truncate(e.path, 34)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className="ui-sans text-ink-muted whitespace-nowrap shrink-0"
                        style={{
                          fontSize: "0.7rem",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {formatRelativeAgo(e.lastSeenAt, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onClick={() => {
          clearOpenTimer();
          clearCloseTimer();
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={summary}
        className="ui-sans transition-opacity"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.55rem",
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 999,
          cursor: "pointer",
          padding: "0.32rem 0.7rem 0.32rem 0.55rem",
          color: "var(--ink)",
          lineHeight: 1,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            boxShadow:
              total > 0
                ? "0 0 0 3px rgba(138, 125, 32, 0.18)"
                : "none",
          }}
        />
        <span
          style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          {total}
        </span>
        <span
          style={{
            fontSize: "0.62rem",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink-muted)",
          }}
        >
          on the site
        </span>
      </button>
      {popover}
    </>
  );
}
