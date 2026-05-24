"use client";

import { useEffect, useRef, useState } from "react";

// Manager for custom Wire lines — host-authored one-liners that scroll
// in the Watch Feed ticker alongside the live activity. Self-contained:
// reads /api/admin/watch-wire on mount, adds/removes lines. Mounted
// inside the Watch Feed admin panel.

type WireLine = { id: string; text: string };

export function WatchWireControl() {
  const [lines, setLines] = useState<WireLine[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/watch-wire", { cache: "no-store" });
        const data: { ok?: boolean; lines?: WireLine[] } = await res
          .json()
          .catch(() => ({}));
        if (!cancelledRef.current && res.ok && data.ok && Array.isArray(data.lines)) {
          setLines(data.lines);
        }
      } catch {
        // keep empty
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/watch-wire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data: { ok?: boolean; lines?: WireLine[]; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.lines)) {
        setLines(data.lines);
        setDraft("");
      } else {
        setError(data.error ?? "Couldn't add.");
      }
    } catch {
      setError("Couldn't add.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/watch-wire", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data: { ok?: boolean; lines?: WireLine[] } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.lines)) setLines(data.lines);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-6">
      <p className="eyebrow mb-2" style={{ fontSize: "0.62rem" }}>
        Ticker lines
      </p>
      <p
        className="font-serif italic text-ink-muted mb-3"
        style={{ fontSize: "0.86rem" }}
      >
        Your own lines that scroll in the Wire, mixed with the live
        activity. Good for an agenda, a teaser, or a one-line quote.
      </p>

      <form onSubmit={add} className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.slice(0, 140));
            setError(null);
          }}
          disabled={pending}
          placeholder="TONIGHT: open hang till 9"
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink flex-1"
          style={{ fontSize: "0.95rem", minWidth: "16rem" }}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="btn-primary"
          style={{
            opacity: pending || !draft.trim() ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>add line</span>
        </button>
      </form>

      {error && (
        <p
          className="font-serif italic text-sm mb-3"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}

      {lines.length > 0 ? (
        <ul className="flex flex-col">
          {lines.map((l, idx) => (
            <li
              key={l.id}
              className={
                "flex items-start justify-between gap-4 py-2.5 " +
                (idx === 0 ? "" : "border-t border-rule")
              }
            >
              <span
                className="font-serif text-ink min-w-0 flex-1"
                style={{ fontSize: "0.92rem" }}
              >
                <span className="text-eye-deep" aria-hidden="true">
                  ◆{" "}
                </span>
                {l.text}
              </span>
              <button
                type="button"
                onClick={() => remove(l.id)}
                disabled={pending}
                className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep no-underline transition-colors"
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  cursor: pending ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                  paddingTop: "0.15rem",
                }}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.88rem" }}
        >
          No custom lines yet. The Wire still runs the live activity.
        </p>
      )}
    </div>
  );
}
