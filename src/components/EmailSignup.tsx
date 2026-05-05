"use client";

import { useState } from "react";

// Temporary: routing through the ReadSowell-branded Kit form (91813c2713)
// while the SBP form (6d65bbd568) is investigated by Kit support — it's
// silently operating in double-opt-in mode despite the UI showing single
// opt-in. Both forms land subscribers in the same list and trigger the same
// welcome automation, so this is a same-destination workaround. Swap back
// once SBP form is fixed.
const KIT_FORM_ENDPOINT = "https://app.kit.com/forms/91813c2713/subscriptions";

type Status = "idle" | "loading" | "success" | "error";

export function EmailSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const response = await fetch(KIT_FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_address: email }),
      });
      if (!response.ok) {
        throw new Error("Subscription failed. Please try again.");
      }
      setStatus("success");
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
        className="flex flex-col sm:flex-row gap-0 w-full border border-ink"
      >
        <input
          type="email"
          name="email_address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "loading"}
          placeholder="your email address"
          className="flex-1 bg-paper px-4 py-4 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors whitespace-nowrap text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ fontWeight: 600 }}
        >
          {status === "loading" ? "Subscribing…" : "Subscribe"}
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
