"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// One-shot migration trigger for /admin/comments. The chrono feed
// reads from the comments:all ZSET, which is only populated for
// comments created after that index existed. Hitting this button
// POSTs /api/admin/backfill-comments-index — it's idempotent, so it's
// safe to click any time the feed seems short.

export function BackfillCommentsIndexButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/backfill-comments-index", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        added?: number;
        skipped?: number;
        unreadable?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Backfill failed.");
        setPending(false);
        return;
      }
      const added = data.added ?? 0;
      const skipped = data.skipped ?? 0;
      setResult(
        added === 0
          ? `Nothing to add. ${skipped} already indexed.`
          : `Added ${added} comment${added === 1 ? "" : "s"}. ${skipped} already indexed.`
      );
      setPending(false);
      router.refresh();
    } catch {
      setError("Backfill failed.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{
          fontSize: "0.7rem",
          fontWeight: 600,
          opacity: pending ? 0.55 : 1,
        }}
      >
        {pending ? "rebuilding…" : "rebuild comments index"}
      </button>
      {result && (
        <span
          className="font-serif italic"
          style={{ fontSize: "0.85rem", color: "var(--eye-deep)" }}
        >
          {result}
        </span>
      )}
      {error && (
        <span
          className="font-serif italic"
          style={{ fontSize: "0.85rem", color: "#7a3a2e" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
