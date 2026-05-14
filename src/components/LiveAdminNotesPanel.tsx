"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Note } from "@/lib/notes";
import { AdminNoteRow } from "@/components/AdminNoteRow";

// Live-polling wrapper around the admin Notes Inbox on /admin/desk.
// Polls GET /api/admin/notes?status=active every POLL_INTERVAL_MS and
// merges the result into local state, so notes a member just left
// show up without a manual refresh.
//
// Notes that arrived during this session (not in the server-rendered
// initial set) get a brief olive highlight via .admin-note-fresh —
// fades out automatically after the animation completes, so it only
// pulls attention the first time Clay sees it.

const POLL_INTERVAL_MS = 10_000;
const FRESH_ANIM_MS = 3_500;

type Props = {
  initialNotes: Note[];
};

export function LiveAdminNotesPanel({ initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialNotes.map((n) => n.id))
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      // Pause polling while the tab is hidden — no point burning
      // requests when nobody's looking. Resumes on visibility change
      // (see listener below).
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/admin/notes?status=active", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { notes?: Note[] };
        if (cancelled || !Array.isArray(data.notes)) return;

        const incoming = data.notes;
        const newlyArrived = incoming.filter(
          (n) => !seenIdsRef.current.has(n.id)
        );

        if (newlyArrived.length > 0) {
          // Mark them fresh + add to seen so we don't re-highlight on
          // the next poll.
          newlyArrived.forEach((n) => seenIdsRef.current.add(n.id));
          setFreshIds((prev) => {
            const next = new Set(prev);
            newlyArrived.forEach((n) => next.add(n.id));
            return next;
          });
          // Clear the fresh flag after the highlight animation
          // completes so a still-unread note doesn't sit glowing
          // forever.
          window.setTimeout(() => {
            setFreshIds((prev) => {
              const next = new Set(prev);
              newlyArrived.forEach((n) => next.delete(n.id));
              return next;
            });
          }, FRESH_ANIM_MS);
        }

        setNotes(incoming);
      } catch {
        // Network blip — try again on the next tick.
      }
    }

    function schedule() {
      timer = window.setTimeout(async () => {
        await poll();
        if (!cancelled) schedule();
      }, POLL_INTERVAL_MS);
    }
    schedule();

    function onVisibility() {
      if (!document.hidden) {
        // Tab regained focus — immediate poll instead of waiting for
        // the next scheduled tick.
        poll();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (notes.length === 0) return null;

  const newNotesCount = notes.filter((n) => n.status === "new").length;

  return (
    <section className="mb-14">
      <div
        className="border border-rule p-6 md:p-8"
        style={{ background: "var(--paper-deep)" }}
      >
        <div className="flex items-baseline justify-between gap-4 mb-2 flex-wrap">
          <p
            className="eyebrow"
            style={{ letterSpacing: "0.32em", fontSize: "0.65rem" }}
          >
            Notes inbox
          </p>
          <Link
            href="/admin/notes"
            className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.65rem", fontWeight: 600 }}
          >
            manage all &rarr;
          </Link>
        </div>
        <p
          className="font-serif italic text-ink-muted mb-6"
          style={{ fontSize: "0.9rem" }}
        >
          {newNotesCount > 0
            ? `${newNotesCount} new · ${notes.length} active`
            : `${notes.length} active · no new ones`}
        </p>

        <ul className="flex flex-col">
          {notes.map((note, idx) => {
            const isFresh = freshIds.has(note.id);
            return (
              <li
                key={note.id}
                className={
                  (idx === 0 ? "py-5" : "py-5 border-t border-rule") +
                  (isFresh ? " admin-note-fresh" : "")
                }
              >
                <AdminNoteRow note={note} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
