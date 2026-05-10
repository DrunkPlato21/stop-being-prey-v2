"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminDonationRow({
  slug,
  id,
}: {
  slug: string;
  id: string;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "approve" | "reject" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setPendingAction(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/walls/donations/${slug}/${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Action failed.");
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed.";
      setError(msg);
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <button
        type="button"
        onClick={() => act("approve")}
        disabled={pendingAction !== null}
        className="px-4 py-2 border border-eye bg-eye/10 text-ink hover:bg-eye/20 transition-colors disabled:opacity-50 text-sm uppercase tracking-[0.14em]"
      >
        {pendingAction === "approve" ? "Approving…" : "Approve"}
      </button>
      <button
        type="button"
        onClick={() => act("reject")}
        disabled={pendingAction !== null}
        className="px-4 py-2 border border-ink/20 text-ink-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-50 text-sm uppercase tracking-[0.14em]"
      >
        {pendingAction === "reject" ? "Rejecting…" : "Reject"}
      </button>
      {error && (
        <span
          className="text-xs italic"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
