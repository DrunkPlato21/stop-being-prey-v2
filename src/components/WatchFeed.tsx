"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// The Watch Feed — member-facing card stack that sits above the lounge
// chat. Polls /api/watch-feed every POLL_INTERVAL_MS, reconciles
// against current state, and renders new cards with a slide-in
// animation + brief border pulse so the live signal is felt, not just
// noticed. When the user is scrolled away from the feed, an unseen
// count is surfaced on a small badge so they can jump back up.
//
// Visually distinct from the Writer's Desk update card: thinner border,
// olive accent stripe on the left, smaller eyebrow ("THE WATCH").
//
// Returns null when there are no posts and never had any — keeps the
// surface invisible outside event hours.

export type WatchPost = {
  id: string;
  body: string;
  link: string | null;
  createdAt: number;
};

type Props = {
  initialPosts: WatchPost[];
};

const POLL_INTERVAL_MS = 5_000;
const FRESH_WINDOW_MS = 5 * 60 * 1000; // 5min: pulses on freshly-arrived cards
const PULSE_DURATION_MS = 4_000;

export function WatchFeed({ initialPosts }: Props) {
  const [posts, setPosts] = useState<WatchPost[]>(initialPosts);
  const [now, setNow] = useState<number>(() => Date.now());
  // IDs the viewer has already seen (so a fresh page load doesn't
  // pulse every existing card; only NEW ones that arrive after
  // mount get the live treatment).
  const seenIds = useRef<Set<string>>(
    new Set(initialPosts.map((p) => p.id))
  );
  // IDs that should pulse right now. Cleared per-id after
  // PULSE_DURATION_MS so the CSS animation only fires once.
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());
  // Hidden "new since you scrolled away" tracking. Reset to 0 when
  // the feed scrolls into view.
  const [unseenCount, setUnseenCount] = useState<number>(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const isInViewRef = useRef<boolean>(true);

  // Track whether the header is on-screen. When it scrolls out of view,
  // arriving posts increment unseenCount. When it scrolls back in,
  // unseenCount resets.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        isInViewRef.current = entry.isIntersecting;
        if (entry.isIntersecting) setUnseenCount(0);
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Tick relative-time formatter every 15s.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  // Live poll. Pulls the feed every POLL_INTERVAL_MS and compares
  // against seenIds; cards that weren't there before slide in and
  // pulse. Pauses while the tab is hidden so background tabs aren't
  // burning the lounge's Redis budget.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/watch-feed", { cache: "no-store" });
        if (!res.ok) return;
        const data: { ok?: boolean; posts?: WatchPost[] } = await res
          .json()
          .catch(() => ({}));
        if (!data.ok || !Array.isArray(data.posts)) return;
        if (cancelled) return;

        // Identify fresh arrivals. Anything we don't already have in
        // seenIds is "new" — pulse it and bump unseen-when-scrolled.
        const arriving = data.posts.filter((p) => !seenIds.current.has(p.id));
        if (arriving.length > 0) {
          for (const p of arriving) seenIds.current.add(p.id);
          setPulsingIds((prev) => {
            const next = new Set(prev);
            for (const p of arriving) next.add(p.id);
            return next;
          });
          if (!isInViewRef.current) {
            setUnseenCount((n) => n + arriving.length);
          }
          // Clear pulse on each fresh arrival after the duration.
          for (const p of arriving) {
            window.setTimeout(() => {
              setPulsingIds((prev) => {
                if (!prev.has(p.id)) return prev;
                const next = new Set(prev);
                next.delete(p.id);
                return next;
              });
            }, PULSE_DURATION_MS);
          }
        }

        // Replace state with the server snapshot. Handles deletes too
        // (anything missing from the snapshot drops out of state).
        setPosts(data.posts);
      } catch {
        // Network blip — leave existing state alone.
      }
    }

    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    // Also poll immediately on focus so a tab returning from sleep
    // gets a fresh snapshot without waiting up to POLL_INTERVAL_MS.
    function onFocus() {
      void poll();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const sorted = useMemo(
    () => [...posts].sort((a, b) => b.createdAt - a.createdAt),
    [posts]
  );

  if (sorted.length === 0) {
    // Stay invisible outside event hours. Header still renders nothing
    // so the lounge layout doesn't shift when the first card lands.
    return null;
  }

  return (
    <div className="mb-10">
      <div
        ref={headerRef}
        className="flex items-baseline justify-between gap-3 mb-3"
      >
        <p
          className="eyebrow"
          style={{
            letterSpacing: "0.32em",
            fontSize: "0.65rem",
          }}
        >
          The Watch
        </p>
        {unseenCount > 0 && (
          <button
            type="button"
            onClick={() => {
              headerRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
              setUnseenCount(0);
            }}
            className="watch-feed-unseen-badge"
            aria-label={`${unseenCount} new ${
              unseenCount === 1 ? "post" : "posts"
            } in The Watch`}
          >
            {unseenCount} new
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {sorted.map((p) => {
          const isFresh = now - p.createdAt < FRESH_WINDOW_MS;
          const isPulsing = pulsingIds.has(p.id);
          return (
            <li key={p.id}>
              <article
                className={
                  "watch-feed-card" +
                  (isPulsing ? " watch-feed-card-pulsing" : "") +
                  (isPulsing ? " watch-feed-card-arriving" : "")
                }
              >
                <header className="flex items-baseline justify-between gap-3 mb-2">
                  <p
                    className="font-display uppercase"
                    style={{
                      fontSize: "0.6rem",
                      letterSpacing: "0.24em",
                      fontWeight: 700,
                      color: "var(--eye-deep)",
                    }}
                  >
                    From Clay
                  </p>
                  <p
                    className="font-serif italic text-ink-faint"
                    style={{ fontSize: "0.78rem" }}
                  >
                    {formatRelative(p.createdAt, now)}
                    {isFresh ? " · live" : ""}
                  </p>
                </header>
                <p
                  className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                  style={{ fontSize: "1rem" }}
                >
                  {p.body}
                </p>
                {p.link && (
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="watch-feed-card-link"
                  >
                    <span>{prettyLink(p.link)}</span>
                    <span aria-hidden="true">&nbsp;&rarr;</span>
                  </a>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatRelative(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function prettyLink(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}
