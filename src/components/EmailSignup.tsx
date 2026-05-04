"use client";

import { useState } from "react";

export function EmailSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");

    try {
      const response = await fetch(
        "https://app.kit.com/forms/6d65bbd568/subscriptions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_address: email }),
        }
      );
      if (!response.ok) {
        throw new Error("Subscription failed");
      }
      setStatus("ok");
      setEmail("");
    } catch (err) {
      setStatus("err");
      console.error("Email signup error:", err);
    }
  }

  if (status === "ok") {
    return (
      <p className="text-eye-deep font-display text-lg italic">
        You&apos;re on the list. Check your inbox.
      </p>
    );
  }

  if (status === "err") {
    return (
      <div className="flex flex-col gap-3 w-full max-w-xl">
        <p className="text-ink-soft font-serif italic text-sm">
          Something went wrong. Please try again or email{" "}
          clay@readsowell.com directly.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="text-eye-deep underline text-sm self-start font-display uppercase tracking-[0.18em]"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-0 w-full max-w-xl border border-ink"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your email address"
        className="flex-1 bg-paper px-4 py-4 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="bg-ink text-paper hover:bg-eye-deep disabled:opacity-60 px-6 py-4 font-display transition-colors whitespace-nowrap text-sm uppercase tracking-widest"
        style={{ fontWeight: 600 }}
      >
        {status === "loading" ? "..." : "Subscribe"}
      </button>
    </form>
  );
}
