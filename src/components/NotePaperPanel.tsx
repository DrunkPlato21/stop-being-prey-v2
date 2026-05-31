"use client";

import { useState } from "react";
import type { Note } from "@/lib/notes";
import { LeaveNoteForm } from "@/components/LeaveNoteForm";
import { PastNotes } from "@/components/PastNotes";

// "Paper peeking from the desk" entry point to the leave-a-note flow.
// Three render phases:
//   - collapsed: just a sheet of notepaper sticking up out of a slot.
//   - rising: paper animates up + out (350ms) before the form mounts.
//   - expanded: form + past notes visible, "X" closes.
//
// Submission keeps the panel open so the member watches their note
// land in "Your past notes" instead of having the surface vanish on
// them. Manual close via the X.

type Phase = "collapsed" | "rising" | "expanded";

const PAPER_RISE_MS = 350;

export function NotePaperPanel({
  memberNotes,
  onSubmitted,
  lastVisitedAt,
}: {
  memberNotes: Note[];
  onSubmitted: (note: Note) => void;
  /** Server-side timestamp of the member's previous desk visit.
      Used to flag unread replies/reactions on the collapsed paper.
      Null for first-time visitors or admins. */
  lastVisitedAt: number | null;
}) {
  const [phase, setPhase] = useState<Phase>("collapsed");

  function expand() {
    if (phase !== "collapsed") return;
    setPhase("rising");
    window.setTimeout(() => setPhase("expanded"), PAPER_RISE_MS);
  }

  function collapse() {
    setPhase("collapsed");
  }

  function handleFormSubmitted(note: Note) {
    onSubmitted(note);
    // Stay expanded — the just-sent note now sits at the top of
    // "Your past notes" and the member can see it land. They close
    // manually via the X.
  }

  // Dynamic label: first-time member gets the invitation copy; once
  // they've sent at least one note the paper reads as a conversation
  // surface instead of a one-way send.
  const paperLabel =
    memberNotes.length === 0 ? "Leave Clay a Note" : "Notes with Clay";

  // Unread Clay activity since the member's last desk visit. Any
  // clayReply or clayReaction whose timestamp beats `lastVisitedAt`
  // earns the small olive dot on the collapsed paper. First-time
  // visitors (lastVisitedAt === null) get no dot — the count alone
  // tells them something's there.
  const hasUnreadFromClay = (() => {
    if (lastVisitedAt === null) return false;
    for (const n of memberNotes) {
      if (n.clayRepliedAt && n.clayRepliedAt > lastVisitedAt) return true;
      if (n.clayReactedAt && n.clayReactedAt > lastVisitedAt) return true;
    }
    return false;
  })();

  return (
    <div className="note-paper-region">
      {phase === "expanded" ? (
        <div className="note-form-panel">
          <button
            type="button"
            onClick={collapse}
            aria-label="Close"
            className="note-form-close"
          >
            ×
          </button>
          <p
            className="eyebrow mb-4 flex items-center gap-2"
            style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
          >
            <span>Leave a note on the desk</span>
            <LockGlyph size={11} />
            <span style={{ color: "var(--ink-faint)" }}>private</span>
          </p>
          <LeaveNoteForm onSubmitted={handleFormSubmitted} />
          <PastNotes notes={memberNotes} />
        </div>
      ) : (
        <>
          {/* The paper sits visually above the slot. While "rising" it
              animates up + fades. Clicking the slot itself also expands
              so a near-miss tap still works. */}
          <button
            type="button"
            onClick={expand}
            disabled={phase === "rising"}
            className={
              phase === "rising"
                ? "note-paper note-paper-rising"
                : "note-paper"
            }
            aria-label={collapsedAriaLabel(memberNotes, hasUnreadFromClay)}
          >
            <span className="note-paper-label">{paperLabel}</span>
            {memberNotes.length > 0 && (
              <span className="note-paper-count" aria-hidden="true">
                {memberNotes.length}
              </span>
            )}
            <span className="note-paper-lock" aria-hidden="true">
              <LockGlyph size={11} />
            </span>
            {hasUnreadFromClay && (
              <span
                className="note-paper-unread-dot"
                aria-hidden="true"
              />
            )}
            <span className="note-paper-pencil" aria-hidden="true">
              ✎
            </span>
          </button>
          <div className="note-slot" aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function LockGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="2.5" y="5.5" width="7" height="5" rx="0.6" />
      <path d="M4 5.5 V4 a2 2 0 0 1 4 0 V5.5" />
    </svg>
  );
}

function collapsedAriaLabel(notes: Note[], hasUnread: boolean): string {
  if (notes.length === 0) return "Leave Clay a private note";
  const base = `Open your notes with Clay (${notes.length})`;
  return hasUnread ? `${base} — new reply` : base;
}
