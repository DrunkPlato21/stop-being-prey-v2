"use client";

import { useState } from "react";
import type { Note } from "@/lib/notes";
import { ReactionIcon, REACTION_LABELS } from "@/components/ReactionIcon";

// Member-only view of their own notes. Pure presentation — parent
// (WritersDeskView) owns the notes array and re-fetches via the
// polling loop, so a reply or reaction Clay writes since the last
// poll appears without an explicit refresh.
//
// The list shows the 5 most-recent notes by default; "Show older"
// expands the rest. Each note renders Clay's reply (if any) in an
// olive-bordered block underneath, plus his reaction (if any) as a
// small colorful glyph inline with the "Clay · ..." attribution.

const VISIBLE_BY_DEFAULT = 5;

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PastNotes({ notes }: { notes: Note[] }) {
  // Default to expanded — a member opening the notepaper is almost
  // always doing it to see Clay's reply (often via the in-site
  // notification). Forcing them to click "+" first hid the reply
  // behind a discovery step. They can still collapse manually.
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  if (notes.length === 0) {
    return null;
  }

  const visibleNotes =
    showAll || notes.length <= VISIBLE_BY_DEFAULT
      ? notes
      : notes.slice(0, VISIBLE_BY_DEFAULT);
  const hiddenCount = notes.length - visibleNotes.length;

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
        <>
          <ul className="mt-2 flex flex-col">
            {visibleNotes.map((note, idx) => {
              const hasReply = !!note.clayReply && !!note.clayRepliedAt;
              const hasReaction = !!note.clayReaction && !!note.clayReactedAt;
              // When Clay reacted but didn't reply, surface the reaction
              // on its own line. Use whichever timestamp is most recent
              // for the attribution stamp.
              const showReactionOnly = hasReaction && !hasReply;
              return (
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

                  {hasReply && (
                    <div
                      className="mt-3 pl-4"
                      style={{ borderLeft: "2px solid var(--eye-deep)" }}
                    >
                      <p
                        className="font-display uppercase mb-1 flex items-center gap-2 flex-wrap"
                        style={{
                          fontSize: "0.6rem",
                          letterSpacing: "0.22em",
                          fontWeight: 600,
                          color: "var(--eye-deep)",
                        }}
                      >
                        <span>
                          Clay · {formatTimestamp(note.clayRepliedAt!)}
                        </span>
                        {hasReaction && (
                          <span
                            title={`Clay reacted: ${REACTION_LABELS[note.clayReaction!]}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <ReactionIcon
                              type={note.clayReaction!}
                              size={16}
                            />
                          </span>
                        )}
                      </p>
                      <p
                        className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                        style={{ fontSize: "0.95rem" }}
                      >
                        {note.clayReply}
                      </p>
                    </div>
                  )}

                  {showReactionOnly && (
                    <div
                      className="mt-3 pl-4 flex items-center gap-2"
                      style={{ borderLeft: "2px solid var(--eye-deep)" }}
                    >
                      <span
                        className="font-display uppercase"
                        style={{
                          fontSize: "0.6rem",
                          letterSpacing: "0.22em",
                          fontWeight: 600,
                          color: "var(--eye-deep)",
                        }}
                      >
                        Clay reacted ·{" "}
                        {formatTimestamp(note.clayReactedAt!)}
                      </span>
                      <ReactionIcon type={note.clayReaction!} size={20} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors mt-2 py-2"
              style={{
                fontSize: "0.6rem",
                fontWeight: 600,
                background: "transparent",
                border: 0,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Show older notes ({hiddenCount})
            </button>
          )}
        </>
      )}
    </div>
  );
}
