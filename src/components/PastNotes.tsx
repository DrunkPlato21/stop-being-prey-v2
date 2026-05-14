"use client";

import { useState } from "react";
import type { Note } from "@/lib/notes";

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
          {notes.map((note, idx) => (
            <li
              key={note.id}
              className={idx === 0 ? "py-4" : "py-4 border-t border-rule"}
            >
              <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                <span
                  className="font-serif italic text-ink-faint"
                  style={{ fontSize: "0.78rem" }}
                >
                  {formatTimestamp(note.createdAt)}
                </span>
              </div>
              <p
                className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: "0.95rem" }}
              >
                {note.body}
              </p>

              {note.clayReply && note.clayRepliedAt && (
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
                    Clay · {formatTimestamp(note.clayRepliedAt)}
                  </p>
                  <p
                    className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                    style={{ fontSize: "0.95rem" }}
                  >
                    {note.clayReply}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
