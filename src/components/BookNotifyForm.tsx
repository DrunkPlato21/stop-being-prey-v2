"use client";

import { useState } from "react";

// Notify-me signup for the book. Posts the email to /api/book/notify
// which upserts the subscriber in Kit and attaches the book-notify
// tag. Existing Kit subscribers just gain the tag, no duplicate.

export function BookNotifyForm({
  defaultEmail = "",
}: {
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || done) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Add your email first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/book/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(
          data.error === "invalid_email"
            ? "That email doesn't look right."
            : "Couldn't sign you up. Try again, or email clay@stopbeingprey.com."
        );
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit_failed");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p
        className="font-serif italic text-eye-deep"
        style={{ fontSize: "1rem", lineHeight: 1.6 }}
      >
        You&apos;re on the list. I&apos;ll let you know.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="block">
        <span className="eyebrow block mb-2">Your email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={pending}
          required
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem" }}
        />
      </label>
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="btn-primary"
          style={{
            opacity: pending || !email.trim() ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "signing up..." : "Notify me"}</span>
        </button>
      </div>
      {error && (
        <p
          className="font-serif italic"
          style={{ color: "#7a3a2e", fontSize: "0.9rem" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
