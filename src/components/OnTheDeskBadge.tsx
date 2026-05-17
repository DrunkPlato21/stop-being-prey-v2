"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Compact "on the desk" indicator that lives in the page title row
// on /admin/desk. Renders as a small dot + count + label; on hover
// (or click on touch) it expands a portal'd popover with the full
// visitor list. Portal pattern matches IdentityMenu / NotificationsBell
// so it can't get clipped by any ancestor stacking context.
//
// Source of truth for the data is /api/admin/desk/visitors. The
// initial paint is server-rendered (via initialVisitors), and the
// "refresh" affordance fetches a fresh snapshot.

type Visitor = {
  email: string;
  displayName: string | null;
  lastVisitedAt: number;
};

type ApiResponse = {
  ok?: boolean;
  visitors?: Visitor[];
  totalCount?: number;
  generatedAt?: number;
};

const HOVER_OPEN_DELAY_MS = 180;
const HOVER_CLOSE_DELAY_MS = 280;
const POLL_INTERVAL_MS = 20_000;

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

type AnchorPos = { top: number; right: number };

export function OnTheDeskBadge({
  initialVisitors,
  initialTotalCount,
  windowMinutes,
  generatedAt,
}: {
  initialVisitors: Visitor[];
  initialTotalCount: number;
  windowMinutes: number;
  generatedAt: number;
}) {
  const [visitors, setVisitors] = useState<Visitor[]>(initialVisitors);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
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

  // Refresh visitors when the popover opens (cheap one-shot fetch).
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    let cancelled = false;
    setPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/desk/visitors");
        const data: ApiResponse = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.ok && Array.isArray(data.visitors)) {
          setVisitors(data.visitors);
          setTotalCount(
            typeof data.totalCount === "number"
              ? data.totalCount
              : data.visitors.length
          );
          setStampedAt(
            typeof data.generatedAt === "number" ? data.generatedAt : Date.now()
          );
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Background poll so the count stays live without needing to hover.
  // Pauses when the tab is hidden, and catches up immediately when it
  // becomes visible again.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function refresh() {
      try {
        const res = await fetch("/api/admin/desk/visitors");
        const data: ApiResponse = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.ok && Array.isArray(data.visitors)) {
          setVisitors(data.visitors);
          setTotalCount(
            typeof data.totalCount === "number"
              ? data.totalCount
              : data.visitors.length
          );
          setStampedAt(
            typeof data.generatedAt === "number" ? data.generatedAt : Date.now()
          );
        }
      } catch {
        // Network blip — keep the last snapshot.
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
  }, []);

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

  // Trigger label always reflects the true count in the window
  // (not the truncated list length). The popover handles the
  // "+N more" affordance when more than `visitors.length` exist.
  const count = totalCount;
  const summary =
    count === 0
      ? `0 visitors in last ${windowMinutes} min`
      : count === 1
        ? `1 visitor in last ${windowMinutes} min`
        : `${count} visitors in last ${windowMinutes} min`;
  const hiddenCount = Math.max(0, totalCount - visitors.length);

  function displayFor(v: Visitor): string {
    if (v.displayName) return v.displayName;
    const local = v.email.split("@")[0];
    return local || v.email;
  }

  const popover =
    open && mounted && pos !== null
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Recent desk visitors"
            onMouseEnter={() => {
              clearCloseTimer();
            }}
            onMouseLeave={handleLeave}
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 1000,
              minWidth: 260,
              maxWidth: "min(360px, calc(100vw - 16px))",
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
                On the desk
              </p>
              <span
                className="ui-sans text-ink-muted"
                style={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.02em",
                }}
              >
                {pending ? "refreshing…" : `as of ${formatRelativeAgo(stampedAt, now)}`}
              </span>
            </header>

            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {visitors.length === 0 ? (
                <p
                  className="font-serif italic text-ink-faint px-4 py-4 leading-relaxed"
                  style={{ fontSize: "0.9rem" }}
                >
                  No visits in the last {windowMinutes} min.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {visitors.map((v, idx) => (
                    <li
                      key={v.email}
                      className={
                        "px-4 py-2.5 flex items-center justify-between gap-4 " +
                        (idx === 0 ? "" : "border-t border-rule")
                      }
                    >
                      <span
                        className="font-serif text-ink min-w-0 truncate"
                        style={{ fontSize: "0.92rem" }}
                        title={v.email}
                      >
                        {displayFor(v)}
                      </span>
                      <span
                        className="ui-sans text-ink-muted whitespace-nowrap"
                        style={{
                          fontSize: "0.74rem",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {formatRelativeAgo(v.lastVisitedAt, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {hiddenCount > 0 && (
                <p
                  className="ui-sans text-ink-muted px-4 py-2.5 border-t border-rule text-center"
                  style={{
                    fontSize: "0.72rem",
                    letterSpacing: "0.02em",
                  }}
                >
                  +{hiddenCount} more in the last {windowMinutes} min
                </p>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  const dotColor =
    count > 0 ? "var(--eye-deep)" : "rgba(138, 125, 32, 0.35)";

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
              count > 0
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
          {count}
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
          on the desk
        </span>
      </button>
      {popover}
    </>
  );
}
