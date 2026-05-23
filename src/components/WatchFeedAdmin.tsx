"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";

// Admin controls for The Watch Feed (live broadcast surface above the
// lounge). Two pieces:
//   - WatchFeedComposer: textbox + optional link + post button
//   - WatchFeedRecent: list of recent posts with per-row delete
//
// Loaded inside /admin/desk. Uses fetch to /api/admin/watch-feed (no
// router.refresh) because the admin desk page renders many panels and
// re-running its server pass on every keystroke is wasteful — instead
// each composer / list keeps its own local state and replays the
// server snapshot on mount.

type WatchPost = {
  id: string;
  body: string;
  link: string | null;
  createdAt: number;
};

const MAX_BODY = 600;
const MAX_LINK = 2048;

type AutoResizingTextareaProps =
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows" | "ref"> & {
    value: string;
    minRows?: number;
  };

function AutoResizingTextarea({
  value,
  minRows = 2,
  style,
  ...rest
}: AutoResizingTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      style={{ resize: "none", overflow: "hidden", ...style }}
      {...rest}
    />
  );
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type WatchFeedAdminProps = {
  initialPosts: WatchPost[];
};

export function WatchFeedAdmin({ initialPosts }: WatchFeedAdminProps) {
  const [posts, setPosts] = useState<WatchPost[]>(initialPosts);
  const [expanded, setExpanded] = useState<boolean>(false);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/watch-feed", { method: "GET" });
      const data: { ok?: boolean; posts?: WatchPost[] } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.posts)) {
        setPosts(data.posts);
      }
    } catch {
      // Silent — the existing snapshot stays on the page.
    }
  }

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="watch-feed-admin-body"
        className="flex items-center gap-3 w-full text-left"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          marginBottom: expanded ? "1.25rem" : 0,
        }}
      >
        <span
          className={
            posts.length > 0
              ? "desk-status-dot desk-status-dot-active"
              : "desk-status-dot desk-status-dot-quiet"
          }
          aria-hidden="true"
        />
        <span
          className="font-display uppercase text-ink flex-1"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            fontWeight: 600,
          }}
        >
          The Watch Feed &middot;{" "}
          {posts.length === 0
            ? "Empty"
            : posts.length === 1
              ? "1 post live"
              : `${posts.length} posts live`}
        </span>
        <span
          aria-hidden="true"
          className="text-ink-faint"
          style={{
            fontSize: "0.75rem",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          &rsaquo;
        </span>
      </button>

      {expanded && (
        <div id="watch-feed-admin-body">
          <p
            className="font-serif italic text-ink-muted mb-5"
            style={{ fontSize: "0.92rem" }}
          >
            Live broadcast above the lounge chat. Cards appear in
            members&apos; feed within a few seconds. Newest first; cap
            at 50, older ones drop off the bottom.
          </p>

          <WatchFeedComposer onPosted={refresh} />

          <WatchFeedRecent posts={posts} onDeleted={refresh} />
        </div>
      )}
    </div>
  );
}

function WatchFeedComposer({ onPosted }: { onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!body.trim()) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/watch-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          link: link.trim() || undefined,
        }),
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "post_failed");
        setPending(false);
        return;
      }
      setBody("");
      setLink("");
      setPending(false);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "post_failed");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-8">
      <label className="block">
        <span className="eyebrow block mb-2" style={{ fontSize: "0.65rem" }}>
          New post
        </span>
        <AutoResizingTextarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          minRows={3}
          maxLength={MAX_BODY}
          placeholder="What does the room need to see right now?"
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </label>

      <label className="block">
        <span className="eyebrow block mb-2" style={{ fontSize: "0.65rem" }}>
          Link (optional)
        </span>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value.slice(0, MAX_LINK))}
          placeholder="https://…"
          disabled={pending}
          spellCheck={false}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "0.95rem" }}
        />
      </label>

      <div className="flex items-center justify-between gap-4">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / {MAX_BODY}
        </span>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="btn-primary"
          style={{
            opacity: pending || !body.trim() ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "posting…" : "post to feed"}</span>
        </button>
      </div>
      {error && (
        <p
          className="font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}

function WatchFeedRecent({
  posts,
  onDeleted,
}: {
  posts: WatchPost[];
  onDeleted: () => void;
}) {
  const [now, setNow] = useState<number>(Date.now());

  // Tick relative timestamps once per minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (posts.length === 0) {
    return (
      <p
        className="font-serif italic text-ink-faint"
        style={{ fontSize: "0.95rem" }}
      >
        Nothing posted yet. Drop the first card to start the room.
      </p>
    );
  }

  return (
    <div>
      <p
        className="eyebrow mb-3"
        style={{ fontSize: "0.6rem" }}
      >
        Live cards
      </p>
      <ul className="flex flex-col">
        {posts.map((p, idx) => (
          <li
            key={p.id}
            className={
              idx === 0 ? "py-4" : "py-4 border-t border-rule"
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p
                  className="font-serif italic text-ink-faint mb-1"
                  style={{ fontSize: "0.78rem" }}
                >
                  {formatRelative(p.createdAt, now)} &middot;{" "}
                  {formatTimestamp(p.createdAt)}
                </p>
                <p
                  className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                  style={{ fontSize: "0.98rem" }}
                >
                  {p.body}
                </p>
                {p.link && (
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-serif text-eye-deep hover:text-ink no-underline break-all"
                    style={{ fontSize: "0.85rem" }}
                  >
                    {p.link}
                  </a>
                )}
              </div>
              <DeleteButton id={p.id} onDeleted={onDeleted} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeleteButton({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/admin/watch-feed/${id}`, {
        method: "DELETE",
      });
      if (res.ok) onDeleted();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep no-underline transition-colors"
      style={{
        fontSize: "0.62rem",
        fontWeight: 500,
        background: "transparent",
        border: 0,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? "…" : "delete"}
    </button>
  );
}

function formatRelative(ms: number, now: number): string {
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
