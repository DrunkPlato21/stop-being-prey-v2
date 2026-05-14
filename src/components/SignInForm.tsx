"use client";

import Link from "next/link";
import { useState } from "react";

// Magic-link request form. Posts to /api/auth/request-link. The
// success state is intentionally conditional ("if your email has an
// active membership...") so we never disclose whether a given email
// is on file — but it includes a friendly nudge for the case where
// no email arrives (lapsed member, never joined, brand-new signup
// whose webhook hasn't fired yet).

type Status = "idle" | "loading" | "sent" | "error";

export function SignInForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? "request_failed");
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "request_failed");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display italic text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.2rem" }}
        >
          if{" "}
          <span className="not-italic font-display text-eye-deep">
            {email}
          </span>{" "}
          has an active membership, a sign-in link is on its way.
        </p>
        <p className="text-sm italic text-ink-muted leading-relaxed">
          check your inbox &mdash; the link is good for 15 minutes.
        </p>
        <p className="mt-6 text-sm italic text-ink-muted leading-relaxed">
          Nothing in your inbox? You may not be signed up yet, or your
          membership lapsed.{" "}
          <Link
            href="/membership"
            className="text-eye-deep hover:text-ink"
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--eye)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
            }}
          >
            See membership options.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-0 w-full border border-ink"
      >
        <input
          type="email"
          name="email"
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
          {status === "loading" ? "Sending..." : "Send link"}
        </button>
      </form>
      {status === "error" && error && (
        <p
          className="mt-3 font-serif italic text-sm text-center"
          style={{ color: "#7a3a2e" }}
        >
          {error === "storage_unavailable"
            ? "auth storage isn't reachable. try again in a moment."
            : "something went wrong. try again."}
        </p>
      )}
    </div>
  );
}
