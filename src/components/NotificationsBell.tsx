"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

// Bell + dropdown for member-area notifications.
//
// Mechanics:
//   - Polls /api/notifications/count every 30s while the tab is
//     visible. Pauses when the tab is hidden (Page Visibility API).
//   - On panel open, fetches the full list once (no continuous list
//     polling). The badge keeps polling independently.
//   - After a 1s delay following panel open, marks every currently-
//     visible notification as read. The unread visual cue holds for
//     that glance window so the member sees what's fresh; after the
//     delay the count drops and the rows fade.
//   - Panel is rendered via createPortal into document.body with
//     position: fixed anchored to the bell's bounding rect, same
//     pattern the IdentityMenu uses to dodge stacking contexts.
//
// Empty / unconfigured states fail closed: bell renders, badge stays
// at 0, panel shows the empty-state copy.

const POLL_INTERVAL_MS = 30_000;
const READ_DELAY_MS = 1_000;
const MAX_BADGE_DISPLAY = 99;

type Notification = {
  id: string;
  type:
    | "reaction"
    | "reply"
    | "case_published"
    | "voice_memo"
    | "essay"
    | "wall_opened"
    | "payment_failed"
    | "founder_confirmed"
    | "lounge_reply"
    | "lounge_reaction";
  title: string;
  body: string;
  linkUrl: string;
  read: boolean;
  readAt: number | null;
  createdAt: number;
};

function relativeAgo(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function TypeGlyph({ type }: { type: Notification["type"] }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    style: { flexShrink: 0, display: "inline-block" as const },
  };
  switch (type) {
    case "reaction":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case "reply":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "case_published":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h6l2 2h10v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
          <line x1="6" y1="13" x2="18" y2="13" />
          <line x1="6" y1="16" x2="14" y2="16" />
        </svg>
      );
    case "voice_memo":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <line x1="12" y1="18" x2="12" y2="22" />
        </svg>
      );
    case "essay":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      );
    case "wall_opened":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="14" x2="21" y2="14" />
          <line x1="9" y1="4" x2="9" y2="20" />
          <line x1="15" y1="4" x2="15" y2="20" />
        </svg>
      );
    case "payment_failed":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="7" y1="15" x2="9" y2="15" />
        </svg>
      );
    case "founder_confirmed":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      );
    case "lounge_reply":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          <line x1="9" y1="11" x2="15" y2="11" />
        </svg>
      );
    case "lounge_reaction":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
  }
}

type AnchorPos = { top: number; right: number };

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<AnchorPos | null>(null);
  const [count, setCount] = useState<number>(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  // Snapshot of unread ids at the moment the panel opened — the
  // delayed mark-read uses this so notifications that arrive mid-
  // session via the polling badge don't get auto-marked.
  const pendingMarkRef = useRef<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Polling: every 30s while tab is visible. Resets the timer on
  // visibilitychange so we don't drift behind after the tab returns.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications/count", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: { ok?: boolean; count?: number } = await res
          .json()
          .catch(() => ({}));
        if (cancelled) return;
        if (data.ok && typeof data.count === "number") {
          setCount(data.count);
        }
      } catch {
        // Network blips are fine — next tick will recover.
      }
    }

    function start() {
      if (document.visibilityState === "hidden") return;
      void fetchCount();
      if (timer !== null) window.clearInterval(timer);
      timer = window.setInterval(fetchCount, POLL_INTERVAL_MS);
    }
    function stop() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    }
    function onVis() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Anchor menu to trigger when open + on scroll / resize.
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

  // Click outside + Escape close the menu.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
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

  // Tick `now` while the panel is open so relative timestamps stay
  // honest. 15s is fine — nothing shorter is meaningful given the
  // formatter's resolution.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [open]);

  async function openPanel() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications?limit=10", {
        credentials: "include",
      });
      const data: { ok?: boolean; notifications?: Notification[] } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !Array.isArray(data.notifications)) {
        setError("Couldn't load notifications.");
        setItems([]);
      } else {
        setItems(data.notifications);
        pendingMarkRef.current = data.notifications
          .filter((n) => !n.read)
          .map((n) => n.id);
      }
    } catch {
      setError("Couldn't load notifications.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  // Delayed mark-read after panel open. 1s lets the member glance
  // at the bold unread items before they fade.
  useEffect(() => {
    if (!open) return;
    const ids = pendingMarkRef.current;
    if (ids.length === 0) return;
    const t = window.setTimeout(async () => {
      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids }),
        });
        // Update local state so the rows fade without a refetch.
        setItems((prev) =>
          prev.map((n) =>
            ids.includes(n.id) ? { ...n, read: true, readAt: Date.now() } : n
          )
        );
        setCount((prev) => Math.max(0, prev - ids.length));
        pendingMarkRef.current = [];
      } catch {
        // Best-effort; next poll will reconcile.
      }
    }, READ_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [open, items]);

  const badge =
    count > MAX_BADGE_DISPLAY ? `${MAX_BADGE_DISPLAY}+` : String(count);

  const menu = open && mounted && pos !== null
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Notifications"
          style={{
            position: "fixed",
            top: pos.top,
            right: pos.right,
            zIndex: 1000,
            width: "min(360px, calc(100vw - 16px))",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            boxShadow: "0 6px 22px rgba(26, 23, 20, 0.12)",
          }}
        >
          <header
            className="px-4 py-3 border-b border-rule"
            style={{ background: "var(--paper-deep)" }}
          >
            <p
              className="eyebrow"
              style={{ fontSize: "0.62rem", letterSpacing: "0.32em" }}
            >
              Notifications
            </p>
          </header>

          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {loading ? (
              <p
                className="font-serif italic text-ink-faint px-4 py-5"
                style={{ fontSize: "0.92rem" }}
              >
                Loading&hellip;
              </p>
            ) : error ? (
              <p
                className="font-serif italic px-4 py-5"
                style={{ fontSize: "0.92rem", color: "#7a3a2e" }}
              >
                {error}
              </p>
            ) : items.length === 0 ? (
              <p
                className="font-serif italic text-ink-muted px-4 py-5 leading-relaxed"
                style={{ fontSize: "0.92rem" }}
              >
                No notifications yet. When Clay engages with your
                work, you&apos;ll see it here.
              </p>
            ) : (
              <ul className="flex flex-col">
                {items.map((n) => (
                  <li key={n.id}>
                    <Row notification={n} now={now} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-rule">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center py-3 font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
              style={{ fontSize: "0.62rem", fontWeight: 600 }}
            >
              View all &rarr;
            </Link>
          </footer>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPanel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={
          count > 0
            ? `Notifications, ${count} unread`
            : "Notifications"
        }
        className="notifications-bell-trigger"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          background: "transparent",
          border: 0,
          cursor: "pointer",
          color: "var(--eye-deep)",
          padding: 0,
        }}
      >
        <BellIcon />
        {count > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              background: "var(--eye-deep)",
              color: "var(--paper)",
              fontFamily:
                "var(--font-cormorant), 'EB Garamond', Georgia, serif",
              fontSize: "0.62rem",
              fontWeight: 700,
              lineHeight: "16px",
              letterSpacing: "0.02em",
              textAlign: "center",
              boxShadow: "0 0 0 1.5px var(--paper)",
            }}
          >
            {badge}
          </span>
        )}
      </button>
      {menu}
    </>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function Row({
  notification,
  now,
  onNavigate,
}: {
  notification: Notification;
  now: number;
  onNavigate: () => void;
}) {
  const isInternal = notification.linkUrl.startsWith("/");
  const className =
    "notifications-row flex items-start gap-3 px-4 py-3 no-underline" +
    (notification.read ? " is-read" : " is-unread");
  const inner = (
    <>
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          color: notification.read ? "var(--ink-faint)" : "var(--eye-deep)",
          marginTop: "0.2rem",
        }}
      >
        <TypeGlyph type={notification.type} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="font-display text-ink"
          style={{
            fontSize: "0.95rem",
            fontWeight: notification.read ? 500 : 700,
            letterSpacing: "-0.005em",
            lineHeight: 1.3,
          }}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p
            className="font-serif text-ink-muted mt-1 leading-snug truncate"
            style={{ fontSize: "0.82rem" }}
          >
            {notification.body}
          </p>
        )}
      </div>
      <span
        className="font-serif italic text-ink-faint shrink-0"
        style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}
      >
        {relativeAgo(notification.createdAt, now)}
      </span>
    </>
  );

  if (isInternal) {
    return (
      <Link href={notification.linkUrl} onClick={onNavigate} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={notification.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onNavigate}
      className={className}
    >
      {inner}
    </a>
  );
}
