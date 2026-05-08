"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Single-tap approve. No arming step — approval is non-destructive
// (delete still exists if approval was a mistake).

export function ApproveCommentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        setError("Couldn't approve. Try again.");
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't approve. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="font-display uppercase tracking-[0.2em] bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{
          fontSize: "0.7rem",
          fontWeight: 600,
          color: "var(--eye-deep)",
        }}
      >
        {pending ? "Approving…" : "Approve"}
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
