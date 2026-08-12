"use client";

import { useState } from "react";

// Small client button that POSTs to /api/membership/portal, reads the
// returned URL, and redirects the browser into the Stripe Customer
// Portal. The endpoint already handles auth + portal session creation.

export function ManageSubscriptionButton({
  label = "Manage subscription",
}: {
  // The billing alert points the same portal trip at a narrower job
  // ("Update the card"), so the label is caller-supplied. Default keeps
  // every existing call site rendering exactly as before.
  label?: string;
} = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/membership/portal", { method: "POST" });
      if (!res.ok) {
        setError("The portal isn't reachable right now. Try again in a moment.");
        setPending(false);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) {
        setError("The portal isn't reachable right now. Try again in a moment.");
        setPending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("The portal isn't reachable right now. Try again in a moment.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="btn-primary"
        style={{ opacity: pending ? 0.6 : 1, cursor: pending ? "wait" : "pointer" }}
      >
        <span>{pending ? "Opening portal…" : label}</span>
      </button>
      {error && (
        <p
          className="mt-4 font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
