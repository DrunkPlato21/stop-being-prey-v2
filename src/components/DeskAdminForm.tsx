"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import { useRouter } from "next/navigation";
import type { PresenceState } from "@/lib/desk";

const AWAY_NOTE_MAX = 200;

// Keepalive cadence for an open desk. Well under the server's 4h
// active-session window, so a desk left open and focused never ages out;
// pings pause while the tab is hidden and fire once on return.
const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Client islands for the Writer's Desk admin page:
//   - DeskAdminForm: new-update composer
//   - DeleteDeskUpdateButton: per-row delete
//   - PresenceToggle: "I'm at the desk" / "End session"
//   - ActiveWallControl: feature/hide the Active Wall panel + paste a
//     wall link to pin a specific wall

// Textarea that grows with its content. Initial size = minRows; expands
// as the user types so they're not stuck wrestling the resize handle on
// long status notes. Mirrors the helper in LoungeView.tsx — duplicated
// here rather than extracted so the Lounge composer's behavior stays
// insulated from admin-side changes.
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
    // Reset to "auto" first so the box can shrink when content is
    // deleted. Without this, scrollHeight stays at the previous taller
    // value and the box never gets smaller.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      style={{
        resize: "none",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    />
  );
}

export function DeskAdminForm() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!body.trim()) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
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
      setPending(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "post_failed");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="block">
        <span className="eyebrow block mb-2">New update</span>
        <AutoResizingTextarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minRows={4}
          maxLength={600}
          placeholder="What's on the desk right now?"
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </label>
      <div className="flex items-center justify-between gap-4">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / 600
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
          <span>{pending ? "posting…" : "post update"}</span>
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

export function DeleteDeskUpdateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/desk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
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

type PresenceToggleProps = {
  initialState: PresenceState;
  initialActive: boolean;
  initialAwayNote: string;
};

export function PresenceToggle({
  initialState,
  initialAwayNote,
}: PresenceToggleProps) {
  const router = useRouter();
  const [state, setState] = useState<PresenceState>(initialState);
  const [awayNote, setAwayNote] = useState<string>(initialAwayNote);
  const [pending, setPending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const isActive = state === "active";

  // Keepalive: while the session is active AND this tab is visible, ping
  // the presence endpoint so simply having the desk open keeps the "at
  // the desk" status from aging out at the 4h mark. Fires once on mount
  // and whenever the tab is refocused, then on an interval. The server
  // only extends a still-active session — if it reports the session has
  // aged out (e.g. the tab was hidden past 4h), reflect that and let the
  // effect tear down via the isActive dependency.
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    async function ping() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/admin/desk/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ping" }),
        });
        const data: { ok?: boolean; state?: PresenceState } = await res
          .json()
          .catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.ok && data.state && data.state !== "active") {
          setState(data.state);
          router.refresh();
        }
      } catch {
        // Network blip — the next tick retries.
      }
    }

    void ping();
    const id = window.setInterval(ping, KEEPALIVE_INTERVAL_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") void ping();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isActive, router]);

  async function startSession() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/desk/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data: { ok?: boolean; state?: PresenceState; presence?: { awayNote?: string } } =
        await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.state) {
        setState(data.state);
        setAwayNote(data.presence?.awayNote ?? "");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function endSessionWithNote(note: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/desk/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", awayNote: note }),
      });
      const data: { ok?: boolean; state?: PresenceState; presence?: { awayNote?: string } } =
        await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.state) {
        setState(data.state);
        setAwayNote(data.presence?.awayNote ?? "");
        setModalOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  function handleToggleClick() {
    if (isActive) {
      setModalOpen(true);
    } else {
      startSession();
    }
  }

  const dotClass =
    state === "active"
      ? "desk-status-dot desk-status-dot-active"
      : state === "manually-away"
        ? "desk-status-dot desk-status-dot-recent"
        : "desk-status-dot desk-status-dot-quiet";

  const stateLabel =
    state === "active"
      ? "At the desk"
      : state === "manually-away"
        ? "Away"
        : "Stepped away";

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      {/* Status row */}
      <div className="flex items-center gap-3 mb-5">
        <span className={dotClass} aria-hidden="true" />
        <span
          className="font-display uppercase text-ink"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            fontWeight: 600,
          }}
        >
          {stateLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={handleToggleClick}
        disabled={pending}
        className={`desk-presence-toggle${
          isActive ? " desk-presence-toggle-on" : ""
        }`}
      >
        {pending ? "…" : isActive ? "End session" : "I'm at the desk"}
      </button>

      {/* Away-note editor — only relevant while offline. Members see
          this note on the widget for 24h. */}
      {!isActive && (
        <AwayNoteEditor
          initialNote={awayNote}
          onChange={(note) => setAwayNote(note)}
        />
      )}

      {modalOpen && (
        <EndSessionModal
          pending={pending}
          onSubmit={endSessionWithNote}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function AwayNoteEditor({
  initialNote,
  onChange,
}: {
  initialNote: string;
  onChange: (note: string) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<string>(initialNote);
  const [saved, setSaved] = useState<string>(initialNote);
  const [pending, setPending] = useState(false);

  async function persist(next: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/desk/presence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awayNote: next }),
      });
      const data: { ok?: boolean; presence?: { awayNote?: string } } =
        await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const persisted = data.presence?.awayNote ?? "";
        setSaved(persisted);
        setDraft(persisted);
        onChange(persisted);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const dirty = draft.trim() !== saved.trim();

  return (
    <div className="mt-6">
      <label className="block">
        <span
          className="eyebrow block mb-2"
          style={{ fontSize: "0.65rem" }}
        >
          Away note
        </span>
        <AutoResizingTextarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, AWAY_NOTE_MAX))}
          minRows={3}
          maxLength={AWAY_NOTE_MAX}
          placeholder="Optional. Members see this on the widget."
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
        />
      </label>
      <div className="flex items-center justify-between gap-4 mt-2">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.78rem" }}
        >
          {draft.length} / {AWAY_NOTE_MAX}
          {saved && " · auto-clears 24h after save"}
        </span>
        <div className="flex items-center gap-3">
          {saved && (
            <button
              type="button"
              onClick={() => persist("")}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              clear
            </button>
          )}
          <button
            type="button"
            onClick={() => persist(draft.trim())}
            disabled={pending || !dirty}
            className="btn-secondary"
            style={{
              opacity: pending || !dirty ? 0.6 : 1,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            <span>{pending ? "saving…" : "save note"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function EndSessionModal({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-session-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{
        background: "rgba(26, 23, 20, 0.55)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="relative max-w-md w-full">
        <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye pointer-events-none z-10" />

        <div className="bg-paper border border-border">
          <div className="px-7 py-8">
            <p className="eyebrow mb-3">Ending the session</p>
            <h3
              id="end-session-modal-title"
              className="font-display text-ink leading-snug tracking-tight mb-3"
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                letterSpacing: "-0.018em",
              }}
            >
              Leave an away note?
            </h3>
            <p
              className="font-serif italic text-ink-muted mb-5"
              style={{ fontSize: "0.95rem" }}
            >
              Optional. Members see it on the widget for the next 24
              hours.
            </p>

            <AutoResizingTextarea
              autoFocus
              value={note}
              onChange={(e) =>
                setNote(e.target.value.slice(0, AWAY_NOTE_MAX))
              }
              minRows={3}
              maxLength={AWAY_NOTE_MAX}
              placeholder="e.g. back tomorrow morning, working through the next field note."
              disabled={pending}
              className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
              style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
            />
            <p
              className="font-serif italic text-ink-faint mt-2"
              style={{ fontSize: "0.78rem" }}
            >
              {note.length} / {AWAY_NOTE_MAX}
            </p>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="font-display uppercase tracking-[0.22em] text-ink-muted hover:text-ink transition-colors"
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={() => onSubmit(note.trim())}
                disabled={pending}
                className="btn-primary"
                style={{
                  opacity: pending ? 0.6 : 1,
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                <span>{pending ? "ending…" : "save & end session"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type WallChoice = { slug: string; title: string; status: string };
type ActiveWallApi = {
  ok: boolean;
  override: { enabled: boolean; featuredSlug: string };
  walls: WallChoice[];
  resolvedSlug: string | null;
  resolvedTitle: string | null;
  isKnown: boolean;
};

// Active Wall control for the Writer's Desk widget. Two knobs:
//   - On/Off: master visibility for the panel on the widget.
//   - Featured wall: paste a wall link (or slug). Server extracts the
//     canonical slug. Empty = fall back to auto-selection.
// Loads its initial state on mount via GET so the page-level data isn't
// chained through props; the API call is cheap (one Redis read + a
// filesystem listing of content/walls).

export function ActiveWallControl({
  initialOverride,
  initialWalls,
  initialResolvedTitle,
  initialIsKnown,
}: {
  initialOverride: { enabled: boolean; featuredSlug: string };
  initialWalls: WallChoice[];
  initialResolvedTitle: string | null;
  initialIsKnown: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean>(initialOverride.enabled);
  const [draft, setDraft] = useState<string>(initialOverride.featuredSlug);
  const [savedSlug, setSavedSlug] = useState<string>(
    initialOverride.featuredSlug
  );
  const [walls] = useState<WallChoice[]>(initialWalls);
  const [resolvedTitle, setResolvedTitle] = useState<string | null>(
    initialResolvedTitle
  );
  const [isKnown, setIsKnown] = useState<boolean>(initialIsKnown);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean>(false);

  async function persist(patch: {
    enabled?: boolean;
    featuredInput?: string;
  }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/desk/active-wall", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data: ActiveWallApi | { error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !("ok" in data) || !data.ok) {
        setError(
          ("error" in data && data.error) || "save_failed"
        );
        return;
      }
      setEnabled(data.override.enabled);
      setDraft(data.override.featuredSlug);
      setSavedSlug(data.override.featuredSlug);
      setResolvedTitle(data.resolvedTitle);
      setIsKnown(data.isKnown);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setPending(false);
    }
  }

  const dirty = draft.trim() !== savedSlug;

  const statusLabel = !enabled
    ? "Off"
    : savedSlug
      ? resolvedTitle
        ? `Pinned: ${resolvedTitle}`
        : `Pinned: ${savedSlug} (unknown slug, falling back to auto)`
      : "On · auto-selecting";

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      {/* Summary row — always visible. Click to expand the controls.
          Carries enough state (dot + status label) to read at a glance
          when collapsed, so the admin only opens it when changing
          something. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="active-wall-control-body"
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
            enabled
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
          Active wall &middot; {statusLabel}
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
        <div id="active-wall-control-body">
      <p
        className="font-serif italic text-ink-muted mb-5"
        style={{ fontSize: "0.92rem" }}
      >
        Controls the Active Wall panel on the Writer&apos;s Desk
        widget. Paste a wall link to feature a specific wall. Leave
        blank to auto-select.
      </p>

      <button
        type="button"
        onClick={() => persist({ enabled: !enabled })}
        disabled={pending}
        className={`desk-presence-toggle${
          enabled ? " desk-presence-toggle-on" : ""
        }`}
        style={{ marginBottom: "1.25rem" }}
      >
        {pending ? "…" : enabled ? "Hide panel" : "Show panel"}
      </button>

      <label className="block">
        <span
          className="eyebrow block mb-2"
          style={{ fontSize: "0.65rem" }}
        >
          Featured wall
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://stopbeingprey.com/walls/your-wall-slug"
          disabled={pending || !enabled}
          spellCheck={false}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "0.98rem", opacity: enabled ? 1 : 0.55 }}
        />
      </label>

      <div className="flex items-center justify-between gap-4 mt-2 flex-wrap">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.78rem" }}
        >
          {savedSlug
            ? resolvedTitle
              ? `Currently featuring: ${resolvedTitle}`
              : `Saved slug "${savedSlug}" doesn't match a wall. Auto-selection will run instead.`
            : "No pin set. Auto-selecting newest active wall."}
        </span>
        <div className="flex items-center gap-3">
          {savedSlug && (
            <button
              type="button"
              onClick={() => persist({ featuredInput: "" })}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              clear pin
            </button>
          )}
          <button
            type="button"
            onClick={() => persist({ featuredInput: draft })}
            disabled={pending || !dirty || !enabled}
            className="btn-secondary"
            style={{
              opacity: pending || !dirty || !enabled ? 0.6 : 1,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            <span>{pending ? "saving…" : "save pin"}</span>
          </button>
        </div>
      </div>

      {walls.length > 0 && (
        <div className="mt-5">
          <p
            className="eyebrow mb-2"
            style={{ fontSize: "0.62rem" }}
          >
            Walls on file
          </p>
          <ul className="flex flex-col gap-1.5">
            {walls.map((w) => (
              <li key={w.slug}>
                <button
                  type="button"
                  onClick={() => setDraft(`/walls/${w.slug}`)}
                  disabled={pending || !enabled}
                  className="font-serif text-left text-ink-muted hover:text-eye-deep transition-colors"
                  style={{
                    fontSize: "0.88rem",
                    background: "transparent",
                    border: 0,
                    cursor: pending || !enabled ? "default" : "pointer",
                    padding: 0,
                  }}
                >
                  <span className="font-display uppercase tracking-[0.18em] text-ink-faint mr-2" style={{ fontSize: "0.62rem" }}>
                    {w.status}
                  </span>
                  {w.title}
                  {savedSlug === w.slug && (
                    <span className="text-eye-deep ml-2" style={{ fontSize: "0.78rem" }}>
                      &middot; pinned
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isKnown && savedSlug && (
        <p
          className="font-serif italic mt-3"
          style={{ fontSize: "0.85rem", color: "#7a3a2e" }}
        >
          Heads up: the saved slug doesn&apos;t match any wall in
          content/walls. The widget will fall back to auto-selection.
        </p>
      )}

      {error && (
        <p
          className="font-serif italic mt-3"
          style={{ fontSize: "0.85rem", color: "#7a3a2e" }}
        >
          {error === "nothing_to_update"
            ? "Nothing changed."
            : "Couldn't save. Try again."}
        </p>
      )}
        </div>
      )}
    </div>
  );
}

type RecentVisitor = { email: string; lastVisitedAt: number };

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

// Collapsible panel that shows members who've opened /desk within the
// configured window. Data is read server-side (initialVisitors) so the
// panel paints with a real snapshot on first render. When expanded,
// the user can also hit "refresh" to re-fetch without reloading the
// whole admin page.

export function RecentVisitorsPanel({
  initialVisitors,
  windowMinutes,
  generatedAt,
}: {
  initialVisitors: RecentVisitor[];
  windowMinutes: number;
  generatedAt: number;
}) {
  const router = useRouter();
  const [visitors, setVisitors] = useState<RecentVisitor[]>(initialVisitors);
  const [stampedAt, setStampedAt] = useState<number>(generatedAt);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(generatedAt);

  // Keep the "Xm ago" labels honest while the panel is open. Cheap
  // local tick — no network. When collapsed, we stop the timer.
  useEffect(() => {
    if (!expanded) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, [expanded]);

  async function refresh() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/desk/visitors", {
        method: "GET",
      });
      const data: {
        ok?: boolean;
        visitors?: RecentVisitor[];
        generatedAt?: number;
        error?: string;
      } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !Array.isArray(data.visitors)) {
        setError(data.error ?? "refresh_failed");
        return;
      }
      setVisitors(data.visitors);
      setStampedAt(
        typeof data.generatedAt === "number" ? data.generatedAt : Date.now()
      );
      setNow(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "refresh_failed");
    } finally {
      setPending(false);
    }
  }

  const count = visitors.length;
  const summary =
    count === 0
      ? "Nobody on the desk in the last " + windowMinutes + " min"
      : count === 1
        ? "1 visitor in the last " + windowMinutes + " min"
        : `${count} visitors in the last ${windowMinutes} min`;

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="recent-visitors-body"
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
            count > 0
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
          On the desk &middot; {summary}
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
        <div id="recent-visitors-body">
          <p
            className="font-serif italic text-ink-muted mb-5"
            style={{ fontSize: "0.92rem" }}
          >
            Members whose browser pinged the desk within the last{" "}
            {windowMinutes} minutes. Counts each member once, by their
            most recent visit. The stamp lands a few seconds after the
            widget mounts, so this is a rough &ldquo;who&apos;s on the
            desk lately&rdquo; read rather than a true live count.
          </p>

          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <span
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.78rem" }}
            >
              Snapshot taken {formatRelativeAgo(stampedAt, now)}.
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              {pending ? "refreshing…" : "refresh"}
            </button>
          </div>

          {visitors.length === 0 ? (
            <p
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.95rem" }}
            >
              No visits yet in this window.
            </p>
          ) : (
            <ul className="flex flex-col">
              {visitors.map((v, idx) => (
                <li
                  key={v.email}
                  className={
                    idx === 0
                      ? "py-3 flex items-center justify-between gap-4"
                      : "py-3 flex items-center justify-between gap-4 border-t border-rule"
                  }
                >
                  <span
                    className="font-serif text-ink min-w-0 truncate"
                    style={{ fontSize: "0.95rem" }}
                  >
                    {v.email}
                  </span>
                  <span
                    className="font-serif italic text-ink-faint whitespace-nowrap"
                    style={{ fontSize: "0.82rem" }}
                  >
                    {formatRelativeAgo(v.lastVisitedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p
              className="font-serif italic mt-3"
              style={{ fontSize: "0.85rem", color: "#7a3a2e" }}
            >
              Couldn&apos;t refresh. Try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
