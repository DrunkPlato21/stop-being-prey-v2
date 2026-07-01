"use client";

import { useEffect, useRef, useState } from "react";
import { REACTION_EMOJI, REACTION_KEYS, type ReactionKey } from "@/lib/lounge";

// The reaction summary cluster (top emoji + total), made tappable to reveal
// WHO reacted. Shared by the Guild and Lounge reaction controls — both stored
// the reactor identities all along, so this is just a read. Tap the cluster
// to open a small popover listing each reactor and their emoji; the list is
// fetched lazily on first open. Tap-to-open (not hover) so it works the same
// on touch and desktop.

type Reactor = { name: string; reaction: ReactionKey };

export function ReactorsPopover({
  endpoint,
  counts,
  total,
  small,
}: {
  // GET endpoint returning { ok, reactors: {name, reaction}[] }.
  endpoint: string;
  counts: Partial<Record<ReactionKey, number>>;
  total: number;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reactors, setReactors] = useState<Reactor[] | null>(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const topKeys = REACTION_KEYS.filter((k) => (counts[k] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
    .slice(0, 3);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (reactors === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch(endpoint, {
          cache: "no-store",
          credentials: "include",
        });
        const data = (await res.json().catch(() => null)) as {
          reactors?: Reactor[];
        } | null;
        setReactors(Array.isArray(data?.reactors) ? data.reactors : []);
      } catch {
        setReactors([]);
      } finally {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (total <= 0) return null;

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={toggle}
        className="font-display"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="See who reacted"
        title="See who reacted"
        style={{
          marginLeft: "0.55rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          color: "var(--ink-faint)",
          fontSize: small ? "0.6rem" : "0.66rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex" }}>
          {topKeys.map((k) => (
            <span
              key={k}
              style={{
                fontSize: small ? "0.85rem" : "0.95rem",
                lineHeight: 1,
                marginRight: "-0.2rem",
              }}
            >
              {REACTION_EMOJI[k]}
            </span>
          ))}
        </span>
        <span style={{ marginLeft: "0.3rem" }}>{total}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Who reacted"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            minWidth: "10.5rem",
            maxWidth: "16rem",
            maxHeight: "14rem",
            overflowY: "auto",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            boxShadow: "0 6px 22px rgba(26, 23, 20, 0.12)",
            padding: "0.5rem 0.65rem",
          }}
        >
          {loading ? (
            <p
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.82rem", margin: 0 }}
            >
              Loading&hellip;
            </p>
          ) : reactors && reactors.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {reactors.map((r, i) => (
                <li
                  key={`${r.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.2rem 0",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: "1rem", lineHeight: 1 }}>
                    {REACTION_EMOJI[r.reaction]}
                  </span>
                  <span
                    className="font-serif text-ink-soft"
                    style={{ fontSize: "0.88rem", lineHeight: 1.3 }}
                  >
                    {r.name}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.82rem", margin: 0 }}
            >
              No one yet.
            </p>
          )}
        </div>
      )}
    </span>
  );
}
