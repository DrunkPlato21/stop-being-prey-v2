"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only feature toggle. Renders as a small olive text link
// ("Feature" / "Unfeature") that POSTs the new state to
// /api/admin/comments/:id/feature. Always uses the admin (Basic-auth)
// endpoint — the component is only rendered for admins.

type Props = {
  commentId: string;
  initialFeatured: boolean;
};

export function FeatureCommentButton({
  commentId,
  initialFeatured,
}: Props) {
  const router = useRouter();
  const [featured, setFeatured] = useState(initialFeatured);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    const next = !featured;
    try {
      const res = await fetch(`/api/admin/comments/${commentId}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: next }),
      });
      if (!res.ok) {
        setError("Couldn't update. Try again.");
        setPending(false);
        return;
      }
      setFeatured(next);
      setPending(false);
      router.refresh();
    } catch {
      setError("Couldn't update. Try again.");
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
          color: featured ? "var(--eye-deep)" : "var(--ink-faint)",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "saving…" : featured ? "unfeature" : "feature"}
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
