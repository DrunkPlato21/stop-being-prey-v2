"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Two-tap delete: first click arms ("Delete?"), second click confirms.
// Avoids a confirm() dialog (jarring) and an undo flow (overkill for a
// reaction surface).

export function DeleteCommentButton({
  id,
  admin = false,
}: {
  id: string;
  /** When true, call the Basic-auth-gated admin endpoint instead
      of the session-gated member endpoint. Used on /admin/comments. */
  admin?: boolean;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    if (!armed) {
      setArmed(true);
      // Auto-disarm after a few seconds so an accidental tap doesn't
      // sit primed.
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = admin
        ? await fetch(`/api/admin/comments/${id}/delete`, { method: "POST" })
        : await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't delete. Try again.");
        setPending(false);
        setArmed(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't delete. Try again.");
      setPending(false);
      setArmed(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="font-display uppercase tracking-[0.2em] text-ink-faint hover:text-ink bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          color: armed ? "#7a3a2e" : undefined,
        }}
      >
        {pending ? "Deleting…" : armed ? "Tap to confirm" : "Delete"}
      </button>
      {error && (
        <span
          className="font-serif italic"
          style={{ fontSize: "0.82rem", color: "#7a3a2e" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
