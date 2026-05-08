"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Toggle that controls whether the member gets emailed when Clay
// replies to their comments. Default-on for new and legacy members.
// Optimistic UI: we flip the local state immediately and roll back
// if the request fails.

type Props = {
  initialValue: boolean;
};

export function NotifyOnReplyToggle({ initialValue }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  async function handleToggle() {
    if (pending) return;
    const next = !enabled;
    setEnabled(next);
    setPending(true);
    setError(null);
    setSavedHint(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyOnReply: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // rollback
        setError("Couldn't save. Try again.");
        setPending(false);
        return;
      }
      setSavedHint(next ? "Notifications on." : "Notifications off.");
      setPending(false);
      router.refresh();
    } catch {
      setEnabled(!next); // rollback
      setError("Couldn't save. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <p
            className="eyebrow mb-2"
            style={{ letterSpacing: "0.22em", fontSize: "0.65rem" }}
          >
            Reply notifications
          </p>
          <p
            className="font-serif text-ink-muted leading-relaxed"
            style={{ fontSize: "0.95rem" }}
          >
            Email me when Clay replies to one of my comments.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          role="switch"
          aria-checked={enabled}
          aria-label="Reply notifications"
          className="relative shrink-0 transition-colors"
          style={{
            width: "3.25rem",
            height: "1.85rem",
            borderRadius: "999px",
            border: "1px solid var(--ink)",
            background: enabled ? "var(--ink)" : "transparent",
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          <span
            aria-hidden="true"
            className="block transition-transform"
            style={{
              position: "absolute",
              top: "50%",
              left: "0.18rem",
              width: "1.35rem",
              height: "1.35rem",
              borderRadius: "999px",
              background: enabled ? "var(--paper)" : "var(--ink)",
              transform: enabled
                ? "translate(1.4rem, -50%)"
                : "translate(0, -50%)",
              transition: "transform 0.18s ease, background-color 0.18s ease",
            }}
          />
        </button>
      </div>
      {savedHint && !error && (
        <p
          className="font-serif italic"
          style={{ fontSize: "0.82rem", color: "var(--eye-deep)" }}
        >
          {savedHint}
        </p>
      )}
      {error && (
        <p
          className="font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
