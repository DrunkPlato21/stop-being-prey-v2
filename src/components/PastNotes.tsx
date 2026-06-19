"use client";

import { useState } from "react";
import type { Note } from "@/lib/notes";
import { ReactionIcon } from "@/components/ReactionIcon";

// Member-only view of their own notes. Pure presentation — parent
// (WritersDeskView) owns the notes array and re-fetches via the
// polling loop, so a reply Clay wrote since the last poll appears
// without any explicit refresh action.

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PastNotes({ notes }: { notes: Note[] }) {
  const [open, setOpen] = useState(false);

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-2 text-left no-underline hover:text-eye-deep transition-colors"
        style={{
          background: "transparent",
          border: 0,
          cursor: "pointer",
        }}
        aria-expanded={open}
      >
        <span
          className="font-display uppercase text-ink-muted"
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.28em",
            fontWeight: 600,
          }}
        >
          Your past notes · {notes.length}
        </span>
        <span
          className="font-display text-ink-faint"
          style={{ fontSize: "0.85rem" }}
          aria-hidden="true"
        >
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <ul className="mt-2 flex flex-col">
          {notes.map((note, idx) => {
            const hasReply = !!(note.clayReply && note.clayRepliedAt);
            const hasReaction = !!(note.clayReaction && note.clayReactedAt);
            return (
              <li
                key={note.id}
                className={idx === 0 ? "py-4" : "py-4 border-t border-rule"}
              >
                <p
                  className="font-serif italic text-ink-faint mb-2"
                  style={{ fontSize: "0.78rem" }}
                >
                  {formatTimestamp(note.createdAt)}
                </p>
                <p
                  className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                  style={{ fontSize: "0.95rem" }}
                >
                  {note.body}
                </p>

                {hasReply ? (
                  <div
                    className="mt-3 pl-4"
                    style={{ borderLeft: "2px solid var(--eye-deep)" }}
                  >
                    <p
                      className="font-display uppercase mb-1 inline-flex items-center gap-1.5"
                      style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.22em",
                        fontWeight: 600,
                        color: "var(--eye-deep)",
                      }}
                    >
                      Clay
                      {hasReaction && (
                        <ReactionIcon type={note.clayReaction!} size={14} />
                      )}
                      replied · {formatTimestamp(note.clayRepliedAt!)}
                    </p>
                    <p
                      className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                      style={{ fontSize: "0.95rem" }}
                    >
                      {note.clayReply}
                    </p>
                  </div>
                ) : hasReaction ? (
                  <p
                    className="mt-3 inline-flex items-center gap-2 font-display uppercase"
                    style={{
                      fontSize: "0.62rem",
                      letterSpacing: "0.2em",
                      fontWeight: 600,
                      color: "var(--eye-deep)",
                    }}
                  >
                    Clay reacted
                    <ReactionIcon type={note.clayReaction!} size={16} />
                  </p>
                ) : (
                  <p
                    className="mt-2 font-serif italic text-ink-faint"
                    style={{ fontSize: "0.8rem" }}
                  >
                    On the desk. Clay picks these up when he&apos;s in.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
