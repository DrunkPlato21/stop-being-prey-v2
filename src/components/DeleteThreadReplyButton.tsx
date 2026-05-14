"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Two-tap delete for a member-to-member thread reply. Mirrors the
// DeleteCommentButton pattern (arm-then-confirm). Authorized for the
// reply author or the admin.

export function DeleteThreadReplyButton({
  commentId,
  replyId,
}: {
  commentId: string;
  replyId: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/comments/${commentId}/thread-reply/${replyId}`,
        { method: "DELETE" }
      );
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
