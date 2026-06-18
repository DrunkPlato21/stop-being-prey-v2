"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// The Watch Feed — live broadcast surface above the lounge chat.
// Two pieces:
//   1. The Wire — horizontal ticker tape across the top. Pulsing LIVE
//      dot, items continuously scroll left, hovering pauses motion.
//      Every active post appears here. When a fresh post arrives, the
//      label flips to "Breaking" for a few seconds and the billboard
//      below cuts in.
//   2. The Billboard — dominant dark card for the newest post.
//      Timestamp ticks every second so the live feel is felt, not
//      noticed.
//
// Returns null when there are no posts.

export type WatchPost = {
  id: string;
  body: string;
  link: string | null;
  createdAt: number;
  // Present on voice notes. `body` is the caption/hook for these.
  audioUrl?: string | null;
  durationSeconds?: number | null;
};

export type WatchArrival = {
  email: string;
  name: string;
  at: number;
};

type Props = {
  initialPosts: WatchPost[];
  initialArrivals?: WatchArrival[];
  initialEnabled?: boolean;
  initialRoomCount?: number;
  initialLines?: WireLine[];
};

// A single entry in the Wire — a live headcount, an arrival, or an
// (older) host post. The Wire is an activity ticker, not an echo of
// the Billboard, so the newest post (shown big below) is excluded.
type WireEntry =
  | { kind: "room"; key: string; at: number; count: number }
  | { kind: "custom"; key: string; at: number; text: string }
  | { kind: "post"; key: string; at: number; post: WatchPost }
  | { kind: "arrival"; key: string; at: number; name: string };

export type WireLine = { id: string; text: string };

// The Watch is off the vast majority of the time. Poll fast (5s) only
// while it's live; when it's off, back off to 30s — just enough to
// notice it being switched on. This keeps an idle lounge tab from
// firing a dynamic function call every 5s for an empty payload.
const ACTIVE_POLL_MS = 5_000;
const IDLE_POLL_MS = 30_000;
const TICK_MS = 1_000;
const BREAKING_DURATION_MS = 8_000;
// Don't surface the live headcount in the Wire below this — a small
// number reads as empty rather than exclusive. Same "embarrassing
// number" guard as the lounge presence line.
const MIN_ROOM_FOR_WIRE = 4;

export function WatchFeed({
  initialPosts,
  initialArrivals = [],
  initialEnabled = true,
  initialRoomCount = 0,
  initialLines = [],
}: Props) {
  const [posts, setPosts] = useState<WatchPost[]>(initialPosts);
  const [arrivals, setArrivals] = useState<WatchArrival[]>(initialArrivals);
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [roomCount, setRoomCount] = useState<number>(initialRoomCount);
  const [lines, setLines] = useState<WireLine[]>(initialLines);
  const [now, setNow] = useState<number>(() => Date.now());
  // Track post ids we've seen so a fresh page-load doesn't fire the
  // "breaking" flash for everything that was already on screen.
  const seenIds = useRef<Set<string>>(
    new Set(initialPosts.map((p) => p.id))
  );
  const [breakingId, setBreakingId] = useState<string | null>(null);
  // Mirror `enabled` into a ref so the poll loop can pick its cadence
  // (5s live / 30s off) without re-subscribing the effect each toggle.
  const enabledRef = useRef<boolean>(initialEnabled);

  // Tick once a second so the dominant card's timer ("Live · 0:43")
  // visibly counts up instead of jumping in 15s steps.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  // Poll the server for new posts. On arrival: flag breaking, swap
  // state. The billboard's keyed remount handles the cut-in animation.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/watch-feed", { cache: "no-store" });
        if (!res.ok) return;
        const data: {
          ok?: boolean;
          enabled?: boolean;
          posts?: WatchPost[];
          arrivals?: WatchArrival[];
          roomCount?: number;
          lines?: WireLine[];
        } = await res.json().catch(() => ({}));
        if (!data.ok) return;
        if (cancelled) return;

        // Honor the on/off switch live — flipping it off in admin
        // collapses the feed for members within a poll cycle. Keep the
        // ref in sync so the next tick picks the right cadence.
        const nextEnabled = data.enabled !== false;
        enabledRef.current = nextEnabled;
        setEnabled(nextEnabled);
        if (Array.isArray(data.arrivals)) setArrivals(data.arrivals);
        if (typeof data.roomCount === "number") setRoomCount(data.roomCount);
        if (Array.isArray(data.lines)) setLines(data.lines);
        if (!Array.isArray(data.posts)) return;

        const arriving = data.posts.filter((p) => !seenIds.current.has(p.id));
        if (arriving.length > 0) {
          for (const p of arriving) seenIds.current.add(p.id);
          const freshest = [...arriving].sort(
            (a, b) => b.createdAt - a.createdAt
          )[0];
          setBreakingId(freshest.id);
          window.setTimeout(() => {
            setBreakingId((cur) => (cur === freshest.id ? null : cur));
          }, BREAKING_DURATION_MS);
        }
        setPosts(data.posts);
      } catch {
        // Network blip — leave state alone, next tick retries.
      }
    }

    // Self-scheduling loop so the cadence can shorten (5s while live)
    // or lengthen (30s while off) between ticks.
    function schedule() {
      const interval = enabledRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS;
      timer = window.setTimeout(async () => {
        await poll();
        if (!cancelled) schedule();
      }, interval);
    }
    schedule();

    function onFocus() {
      void poll();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const sorted = useMemo(
    () => [...posts].sort((a, b) => b.createdAt - a.createdAt),
    [posts]
  );

  const billboard = sorted.length > 0 ? sorted[0] : null;

  // The Wire is a live activity ticker, not a repeat of the Billboard.
  // So: lead with the live headcount, then arrivals, then any *older*
  // host posts (the newest is excluded — it's already the Billboard).
  const wireEntries = useMemo<WireEntry[]>(() => {
    const activity: WireEntry[] = [
      ...arrivals.map((a) => ({
        kind: "arrival" as const,
        key: `a-${a.email}-${a.at}`,
        at: a.at,
        name: a.name,
      })),
      ...sorted
        .filter((p) => p.id !== billboard?.id)
        .map((p) => ({
          kind: "post" as const,
          key: `p-${p.id}`,
          at: p.createdAt,
          post: p,
        })),
    ];
    activity.sort((x, y) => y.at - x.at);

    const customLines: WireEntry[] = lines.map((l) => ({
      kind: "custom" as const,
      key: `c-${l.id}`,
      at: 0,
      text: l.text,
    }));

    const entries: WireEntry[] = [];
    if (roomCount >= MIN_ROOM_FOR_WIRE) {
      entries.push({
        kind: "room",
        key: "room",
        at: Number.MAX_SAFE_INTEGER,
        count: roomCount,
      });
    }
    // Live activity leads; the host's evergreen lines ride after it.
    entries.push(...activity, ...customLines);
    return entries;
  }, [sorted, arrivals, roomCount, lines, billboard]);

  if (!enabled) return null;
  // Show the section when there's a headline post or any live ticker
  // content. (Don't let an empty Wire hide an existing Billboard.)
  if (!billboard && wireEntries.length === 0) return null;

  return (
    <section className="watch-section" aria-label="The Watch">
      {wireEntries.length > 0 && (
        <Wire items={wireEntries} now={now} breaking={breakingId !== null} />
      )}
      {billboard && (
        <Billboard
          post={billboard}
          now={now}
          breaking={breakingId === billboard.id}
        />
      )}
    </section>
  );
}

function Wire({
  items,
  now,
  breaking,
}: {
  items: WireEntry[];
  now: number;
  breaking: boolean;
}) {
  // Repeat the source items enough times that a single set is wider
  // than any reasonable viewport. Two sets back-to-back produce the
  // seamless loop (translate -50% wraps the second set into the first
  // set's position). With min 8 items per set the marquee never shows
  // a visible gap, even with one short source post.
  const repeats = Math.max(1, Math.ceil(8 / items.length));
  const expanded: WireEntry[] = [];
  for (let i = 0; i < repeats; i++) {
    expanded.push(...items);
  }

  // Scale animation duration to content length so a sparse wire isn't
  // a blur and a packed wire isn't a crawl. ~5s per visible item,
  // clamped so it never feels broken.
  const duration = Math.min(Math.max(expanded.length * 5, 30), 120);

  return (
    <div
      className={breaking ? "watch-wire watch-wire-breaking" : "watch-wire"}
    >
      <div className="watch-wire-label">
        <span className="watch-wire-dot" aria-hidden="true" />
        <span>{breaking ? "Breaking" : "The Wire"}</span>
      </div>
      <div className="watch-wire-track">
        <div
          className="watch-wire-marquee"
          style={{ animationDuration: `${duration}s` }}
        >
          <WireSet items={expanded} now={now} />
          <WireSet items={expanded} now={now} ariaHidden />
        </div>
      </div>
    </div>
  );
}

function WireSet({
  items,
  now,
  ariaHidden = false,
}: {
  items: WireEntry[];
  now: number;
  ariaHidden?: boolean;
}) {
  return (
    <ol className="watch-wire-set" aria-hidden={ariaHidden || undefined}>
      {items.map((entry, idx) =>
        entry.kind === "room" ? (
          <li
            key={`${entry.key}-${idx}`}
            className="watch-wire-item watch-wire-item-room"
          >
            <span className="watch-wire-livedot" aria-hidden="true" />
            <span className="watch-wire-body">
              {entry.count} in the room
            </span>
            <span className="watch-wire-sep" aria-hidden="true">
              //
            </span>
          </li>
        ) : entry.kind === "custom" ? (
          <li
            key={`${entry.key}-${idx}`}
            className="watch-wire-item watch-wire-item-custom"
          >
            <span className="watch-wire-marker" aria-hidden="true">
              ◆
            </span>
            <span className="watch-wire-body">{entry.text}</span>
            <span className="watch-wire-sep" aria-hidden="true">
              //
            </span>
          </li>
        ) : entry.kind === "arrival" ? (
          <li
            key={`${entry.key}-${idx}`}
            className="watch-wire-item watch-wire-item-arrival"
          >
            <span className="watch-wire-time">
              {relativeShort(entry.at, now)}
            </span>
            <span className="watch-wire-sep" aria-hidden="true">
              //
            </span>
            <span className="watch-wire-arrival" aria-hidden="true">
              👋
            </span>
            <span className="watch-wire-body">
              {entry.name} walked in
            </span>
          </li>
        ) : (
          <li key={`${entry.key}-${idx}`} className="watch-wire-item">
            <span className="watch-wire-time">
              {relativeShort(entry.post.createdAt, now)}
            </span>
            <span className="watch-wire-sep" aria-hidden="true">
              //
            </span>
            {entry.post.audioUrl && (
              <span className="watch-wire-voice" aria-hidden="true">
                ▶
              </span>
            )}
            <span className="watch-wire-body">
              {wirePreview(entry.post.body)}
            </span>
          </li>
        )
      )}
    </ol>
  );
}

function Billboard({
  post,
  now,
  breaking,
}: {
  post: WatchPost;
  now: number;
  breaking: boolean;
}) {
  const sinceMs = Math.max(0, now - post.createdAt);
  const justIn = sinceMs < 60_000;
  const isVoice = !!post.audioUrl;

  let tag: string;
  if (isVoice) tag = justIn ? "New voice note" : "Voice note";
  else tag = justIn ? "Just in" : "Bulletin";

  return (
    <article
      key={post.id}
      className={
        breaking
          ? "watch-billboard watch-billboard-breaking"
          : "watch-billboard"
      }
    >
      <span aria-hidden="true" className="watch-billboard-scanline" />

      <header className="watch-billboard-eyebrow">
        <span className="watch-billboard-eyebrow-tag">{tag}</span>
        <span className="watch-billboard-eyebrow-rule" aria-hidden="true" />
        <span className="watch-billboard-eyebrow-time">
          {sinceLabel(sinceMs)}
        </span>
      </header>

      <p className="watch-billboard-body">{post.body}</p>

      {isVoice && <VoicePlayer post={post} />}

      {post.link && (
        <a
          href={post.link}
          target="_blank"
          rel="noreferrer noopener"
          className="watch-billboard-link"
        >
          <span>{prettyLink(post.link)}</span>
          <span aria-hidden="true">&rarr;</span>
        </a>
      )}
    </article>
  );
}

// Member-side voice player for a Watch Feed voice note. A hidden
// <audio> element does the playback; the visible chrome is a play
// button + a decorative waveform whose progress tracks currentTime.
// Until the note has been heard it glows and breathes to pull the tap;
// once played it goes calm. "Heard" state is per-browser via
// localStorage so the glow doesn't nag on every reload.
const HEARD_STORAGE_KEY = "watch-voice-heard";
const WAVE_BARS = 40;

function VoicePlayer({ post }: { post: WatchPost }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const [played, setPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);

  const total = post.durationSeconds ?? 0;
  const bars = useMemo(() => barHeights(post.id, WAVE_BARS), [post.id]);

  // Read prior "heard" state once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HEARD_STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(arr) && arr.includes(post.id)) setPlayed(true);
    } catch {
      // localStorage blocked — fine, the card just keeps glowing.
    }
  }, [post.id]);

  function markHeard() {
    setPlayed(true);
    try {
      const raw = window.localStorage.getItem(HEARD_STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(arr) ? (arr as string[]) : [];
      if (!list.includes(post.id)) {
        // Keep the tail bounded so the key can't grow without limit.
        const next = [...list, post.id].slice(-200);
        window.localStorage.setItem(HEARD_STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // ignore
    }
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }

  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    const dur = a.duration && Number.isFinite(a.duration) ? a.duration : total;
    setCur(a.currentTime);
    setProgress(dur > 0 ? Math.min(1, a.currentTime / dur) : 0);
  }

  function seekFromEvent(clientX: number) {
    const wave = waveRef.current;
    const a = audioRef.current;
    if (!wave || !a) return;
    const rect = wave.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const dur = a.duration && Number.isFinite(a.duration) ? a.duration : total;
    if (dur > 0) {
      a.currentTime = frac * dur;
      setProgress(frac);
      setCur(a.currentTime);
    }
  }

  const litCount = Math.round(progress * bars.length);
  const showElapsed = playing || progress > 0;

  return (
    <div
      className={
        played
          ? "watch-voice watch-voice-played"
          : playing
            ? "watch-voice"
            : "watch-voice watch-voice-unheard"
      }
    >
      <audio
        ref={audioRef}
        src={post.audioUrl ?? undefined}
        preload="none"
        onPlay={() => {
          setPlaying(true);
          markHeard();
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(1);
        }}
        onTimeUpdate={onTimeUpdate}
      />

      <button
        type="button"
        onClick={toggle}
        className="watch-voice-play"
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {playing ? (
          <span className="watch-voice-pause" aria-hidden="true">
            <span />
            <span />
          </span>
        ) : (
          <span className="watch-voice-tri" aria-hidden="true" />
        )}
      </button>

      <div
        ref={waveRef}
        className="watch-voice-wave"
        role="presentation"
        onClick={(e) => seekFromEvent(e.clientX)}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            className={
              i < litCount ? "watch-voice-bar watch-voice-bar-lit" : "watch-voice-bar"
            }
            style={{ height: `${h}%`, animationDelay: `${i * 0.045}s` }}
          />
        ))}
        <span
          className="watch-voice-playhead"
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <span className="watch-voice-time">
        {showElapsed
          ? `${clockLabel(cur)} / ${clockLabel(total)}`
          : clockLabel(total)}
      </span>
    </div>
  );
}

// Deterministic per-post waveform silhouette (18%..96% bar heights) so
// the wave is stable across re-renders without measuring real audio.
function barHeights(seed: string, n: number): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const r = (h % 1000) / 1000;
    out.push(18 + Math.round(r * 78));
  }
  return out;
}

function clockLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function relativeShort(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function sinceLabel(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) {
    return `Live · 0:${String(sec).padStart(2, "0")}`;
  }
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 10) {
    return `${min}:${String(remSec).padStart(2, "0")} ago`;
  }
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function wirePreview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 90) return oneLine;
  return oneLine.slice(0, 87) + "…";
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
