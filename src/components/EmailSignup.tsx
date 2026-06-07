"use client";

import { useState } from "react";
import { track } from "@/lib/track";
import type { TrackSource } from "@/lib/analytics";

// Posts to a same-origin Next.js route handler that forwards to Kit
// server-side (Kit's endpoint blocks browser fetch via CORS). The Kit form
// ID lives in /api/subscribe.
const SUBSCRIBE_ENDPOINT = "/api/subscribe";

type Status = "idle" | "loading" | "success" | "error";

// `source`/`slug` are optional funnel attribution: which surface the
// signup came from (inline form, dual block, /join …) and, on an article,
// which piece. They feed sub_submit / sub_success into the analytics so
// each placement's conversion can be read independently.
export function EmailSignup({
  source = "unknown",
  slug,
  submitLabel = "I'm in",
}: {
  source?: TrackSource;
  slug?: string;
  submitLabel?: string;
} = {}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setErrorMessage(null);
    track("sub_submit", { source, slug });
    try {
      const response = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_address: email }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Subscription failed. Please try again.");
      }
      setStatus("success");
      track("sub_success", { source, slug });
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  }

  if (status === "success") {
    return (
      <p className="font-serif italic text-ink text-base leading-relaxed">
        You&rsquo;re on the list. Check your inbox.
      </p>
    );
  }

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-0 w-full border border-ink overflow-hidden"
      >
        <input
          type="email"
          name="email_address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
          placeholder="your email address"
          className="flex-1 min-w-0 bg-paper px-4 py-4 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60 border-0"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors whitespace-nowrap text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed border-0 shrink-0"
          style={{ fontWeight: 600 }}
        >
          {status === "loading" ? "Subscribing…" : submitLabel}
        </button>
      </form>
      {status === "error" && errorMessage && (
        <p className="mt-3 font-serif italic text-sm text-ink-soft" style={{ color: "#7a3a2e" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
