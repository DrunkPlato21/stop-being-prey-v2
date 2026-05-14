"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/lib/notes";
import { LeaveNoteForm } from "@/components/LeaveNoteForm";
import { PastNotes } from "@/components/PastNotes";

// "Paper peeking from the desk" entry point to the leave-a-note flow.
// Three render phases:
//   - collapsed: just a sheet of notepaper sticking up out of a slot.
//   - rising: paper animates up + out (350ms) before the form mounts.
//   - expanded: form + past notes visible, "X" closes.
//
// After a successful submission the form's own confirmation line
// flashes for a few seconds, then we auto-collapse back to the paper.

type Phase = "collapsed" | "rising" | "expanded";

const PAPER_RISE_MS = 350;
const AUTO_COLLAPSE_AFTER_SUBMIT_MS = 4200;

export function NotePaperPanel({
  memberNotes,
  onSubmitted,
}: {
  memberNotes: Note[];
  onSubmitted: (note: Note) => void;
}) {
  const [phase, setPhase] = useState<Phase>("collapsed");
  const collapseTimer = useRef<number | null>(null);

  function expand() {
    if (phase !== "collapsed") return;
    setPhase("rising");
    window.setTimeout(() => setPhase("expanded"), PAPER_RISE_MS);
  }

  function collapse() {
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setPhase("collapsed");
  }

  function handleFormSubmitted(note: Note) {
    onSubmitted(note);
    // Let the form's "Note delivered" confirmation breathe for a beat,
    // then return to the paper. User can also tap X earlier.
    if (collapseTimer.current !== null) {
      window.clearTimeout(collapseTimer.current);
    }
    collapseTimer.current = window.setTimeout(() => {
      setPhase("collapsed");
      collapseTimer.current = null;
    }, AUTO_COLLAPSE_AFTER_SUBMIT_MS);
  }

  // Cleanup any pending timer if unmounted mid-countdown.
  useEffect(() => {
    return () => {
      if (collapseTimer.current !== null) {
        window.clearTimeout(collapseTimer.current);
      }
    };
  }, []);

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
            className="eyebrow mb-4"
            style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
          >
            Leave a note on the desk
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
          >
            <span className="note-paper-label">Leave Clay a Note</span>
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
