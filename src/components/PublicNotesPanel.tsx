"use client";

import { useEffect, useRef } from "react";
import type { Note } from "@/lib/notes";
import { ReactionIcon } from "@/components/ReactionIcon";

// Public-board panel for the Writer's Desk widget. Renders as an
// overlay positioned within the widget's frame (not a new page).
// Lists public-ask notes newest first; each entry can show Clay's
// public reply when present. Both question and reply are capped at
// 150 characters at write time, so the feed reads as short Q / short A.

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Anonymous";
  return trimmed.split(/\s+/)[0] || "Anonymous";
}

function formatRelative(at: number, now: number): string {
  const diff = now - at;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(at);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PublicNotesPanel({
  notes,
  onClose,
  phase = "open",
  freshNoteId = null,
}: {
  notes: Note[];
  onClose: () => void;
  /** "open" mounts with the enter animation; "closing" overlays
      the exit keyframe so the panel can fade out before unmount. */
  phase?: "open" | "closing";
  /** When set, the matching note gets a one-time "freshly landed"
      gold-tint settle animation. Used right after an auto-open from
      a member submission. */
  freshNoteId?: string | null;
}) {
  const now = Date.now();
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus the close button on open so Esc / Tab navigation has an
  // anchor inside the panel.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // Esc to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Public notes board"
      className={
        phase === "closing"
          ? "public-notes-panel public-notes-panel-closing"
          : "public-notes-panel"
      }
    >
      <div className="public-notes-panel-header">
        <div className="flex flex-col">
          <p
            className="eyebrow"
            style={{ letterSpacing: "0.32em", fontSize: "0.7rem" }}
          >
            Public board
          </p>
          <p
            className="font-serif italic text-ink-muted mt-1"
            style={{ fontSize: "0.85rem" }}
          >
            Reader questions Clay may answer publicly.
          </p>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close public board"
          className="public-notes-panel-close"
        >
          ×
        </button>
      </div>

      <div className="public-notes-panel-body">
        {notes.length === 0 ? (
          <p
            className="font-serif italic text-ink-muted text-center"
            style={{ fontSize: "0.95rem", paddingTop: "1rem" }}
          >
            Nothing on the board yet. Leave a public note to be first.
          </p>
        ) : (
          <ul className="flex flex-col">
            {notes.map((n, idx) => (
              <li
                key={n.id}
                className={
                  (idx === 0 ? "py-4" : "py-4 border-t border-rule") +
                  (n.id === freshNoteId ? " public-note-fresh" : "")
                }
              >
                <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                  <span
                    className="font-display text-ink"
                    style={{
                      fontSize: "0.92rem",
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {firstNameOf(n.fromName)}
                  </span>
                  <span
                    className="font-serif italic text-ink-faint"
                    style={{ fontSize: "0.76rem" }}
                  >
                    {formatRelative(n.createdAt, now)}
                  </span>
                </div>
                <p
                  className="font-serif text-ink leading-snug"
                  style={{ fontSize: "0.95rem" }}
                >
                  {n.body}
                </p>

                {n.clayReply && n.clayRepliedAt && (
                  <div
                    className="mt-3 pl-4"
                    style={{ borderLeft: "2px solid var(--eye-deep)" }}
                  >
                    <p
                      className="font-display uppercase mb-1"
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.22em",
                        fontWeight: 600,
                        color: "var(--eye-deep)",
                      }}
                    >
                      Clay · {formatRelative(n.clayRepliedAt, now)}
                    </p>
                    <p
                      className="font-serif text-ink leading-snug"
                      style={{ fontSize: "0.92rem" }}
                    >
                      {n.clayReply}
                    </p>
                  </div>
                )}

                {/* Reaction marker — Facebook-comment style. Bare
                    colored icon at bottom-left of the note with a
                    small CLAY wordmark beside it. No box, no border.
                    Renders whether or not there's also a reply. */}
                {n.clayReaction && n.clayReactedAt && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <ReactionIcon type={n.clayReaction} size={18} />
                    <span
                      className="font-display uppercase text-ink-faint"
                      style={{
                        fontSize: "0.58rem",
                        letterSpacing: "0.24em",
                        fontWeight: 600,
                      }}
                    >
                      Clay
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
