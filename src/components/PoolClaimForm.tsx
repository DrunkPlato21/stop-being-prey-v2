"use client";

import Link from "next/link";
import { useState } from "react";

// Receive-side form for the community pool. Email + one OPTIONAL line.
// No income proof, no required justification — the trust is the point.
// Posts to /api/pool/claim, which emails a confirm link (confirm-email-
// first). This form never learns whether a seat was free; that resolves
// only when they click the link. COPY IS DRAFT — Clay finalizes.

type State =
  | "idle"
  | "loading"
  | "sent"
  | "confirm_pending"
  | "waiting"
  | "already_member"
  | "error";

const MAX_NOTE_LENGTH = 280;

export function PoolClaimForm() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/pool/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note: note || undefined }),
      });
      const data: { state?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "request_failed");
      if (
        data.state === "sent" ||
        data.state === "confirm_pending" ||
        data.state === "waiting" ||
        data.state === "already_member"
      ) {
        setState(data.state);
      } else {
        throw new Error("request_failed");
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "request_failed");
    }
  }

  if (state === "sent" || state === "confirm_pending") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          Check your email.
        </p>
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          {state === "confirm_pending"
            ? "We already sent a confirm link to that address. Open it to take your seat or hold your place in line."
            : "We sent a one-tap confirm link to that address. Open it and your seat is claimed, or your place in line is held until the next one is funded."}
        </p>
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-display text-ink leading-relaxed mb-3"
          style={{ fontSize: "1.3rem", fontWeight: 600 }}
        >
          You&apos;re in line.
        </p>
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          You already confirmed. The moment a reader funds the next seat,
          it&apos;s yours, and we&apos;ll email you. No need to ask again.
        </p>
      </div>
    );
  }

  if (state === "already_member") {
    return (
      <div className="text-center max-w-md mx-auto">
        <p
          className="font-serif text-ink leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          That address already has a way in.{" "}
          <Link href="/notes/sign-in" className="text-eye-deep hover:text-ink">
            Sign in here.
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <label className="block mb-4">
        <span className="eyebrow block mb-2">your email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === "loading"}
          placeholder="where the seat goes"
          className="w-full border border-ink bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
        />
      </label>

      <label className="block mb-6">
        <span className="eyebrow block mb-2">
          anything you want to say (optional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
          disabled={state === "loading"}
          rows={3}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="no need to justify anything. say what you want, or leave it blank."
          className="w-full border border-rule bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink focus:bg-surface transition-colors font-serif text-base disabled:opacity-60 resize-y"
        />
        <span
          className="block text-right font-serif italic text-ink-faint mt-1"
          style={{ fontSize: "0.75rem" }}
        >
          {note.length}/{MAX_NOTE_LENGTH}
        </span>
      </label>

      <button
        type="submit"
        disabled={state === "loading"}
        className="w-full bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontWeight: 600 }}
      >
        {state === "loading" ? "One moment..." : "Ask for a seat"}
      </button>

      <p
        className="font-serif italic text-ink-faint text-center mt-3"
        style={{ fontSize: "0.82rem" }}
      >
        nobody sees that you asked.
      </p>

      {state === "error" && error && (
        <p
          className="mt-3 font-serif italic text-sm text-center"
          style={{ color: "#7a3a2e" }}
        >
          {error === "invalid_email"
            ? "that doesn't look like an email. check it?"
            : error === "storage_unavailable"
              ? "the desk isn't reachable. try again in a moment."
              : "something went wrong. try again."}
        </p>
      )}
    </form>
  );
}
