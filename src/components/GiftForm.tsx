"use client";

import { useState } from "react";

// Pay-it-forward gift checkout form. Term toggle + recipient email +
// optional from-name and note, posts to /api/gift/checkout and
// redirects to Stripe. Copy here is PLACEHOLDER; Clay finalizes.

type Term = {
  months: 3 | 12;
  amountLabel: string;
  label: string;
  sub: string;
};

const TERMS: Term[] = [
  { months: 3, amountLabel: "$39", label: "3 months", sub: "one season inside" },
  { months: 12, amountLabel: "$130", label: "1 year", sub: "the full arc" },
];

const MAX_MESSAGE_LENGTH = 280;

type Status = "idle" | "loading" | "error";

export function GiftForm() {
  const [months, setMonths] = useState<3 | 12>(12);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/gift/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail,
          termMonths: months,
          buyerName: buyerName || undefined,
          message: message || undefined,
        }),
      });
      const data: { url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "request_failed");
      }
      window.location.href = data.url;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "request_failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      {/* Term toggle */}
      <div className="grid grid-cols-2 gap-3 mb-6" role="radiogroup" aria-label="gift term">
        {TERMS.map((t) => {
          const selected = months === t.months;
          return (
            <button
              key={t.months}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMonths(t.months)}
              className={`border px-4 py-4 text-center transition-colors ${
                selected
                  ? "border-ink bg-ink text-paper"
                  : "border-rule bg-paper text-ink hover:border-ink"
              }`}
            >
              <span
                className="block font-display leading-none mb-1"
                style={{ fontSize: "1.35rem", fontWeight: 700 }}
              >
                {t.amountLabel}
              </span>
              <span
                className="block font-display uppercase tracking-[0.18em] mb-1"
                style={{ fontSize: "0.68rem", fontWeight: 600 }}
              >
                {t.label}
              </span>
              <span
                className={`block font-serif italic ${
                  selected ? "" : "text-ink-muted"
                }`}
                style={{ fontSize: "0.8rem" }}
              >
                {t.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recipient */}
      <label className="block mb-4">
        <span className="eyebrow block mb-2">their email</span>
        <input
          type="email"
          required
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          disabled={status === "loading"}
          placeholder="who gets the seat"
          className="w-full border border-ink bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
        />
      </label>

      {/* From name */}
      <label className="block mb-4">
        <span className="eyebrow block mb-2">from (optional)</span>
        <input
          type="text"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          disabled={status === "loading"}
          maxLength={80}
          placeholder="the name on the gift"
          className="w-full border border-rule bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
        />
      </label>

      {/* Note */}
      <label className="block mb-6">
        <span className="eyebrow block mb-2">a short note (optional)</span>
        <textarea
          value={message}
          onChange={(e) =>
            setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
          }
          disabled={status === "loading"}
          rows={3}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="why you're putting them in the room"
          className="w-full border border-rule bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink focus:bg-surface transition-colors font-serif text-base disabled:opacity-60 resize-y"
        />
        <span
          className="block text-right font-serif italic text-ink-faint mt-1"
          style={{ fontSize: "0.75rem" }}
        >
          {message.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </label>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontWeight: 600 }}
      >
        {status === "loading" ? "One moment..." : "Buy their seat"}
      </button>

      <p
        className="font-serif italic text-ink-faint text-center mt-3"
        style={{ fontSize: "0.82rem" }}
      >
        one charge. no recurring billing, for you or for them.
      </p>

      {status === "error" && error && (
        <p
          className="mt-3 font-serif italic text-sm text-center"
          style={{ color: "#7a3a2e" }}
        >
          {error === "invalid_recipient"
            ? "that email can't receive a gift seat. double-check it."
            : error === "storage_unavailable"
              ? "the gift desk isn't reachable. try again in a moment."
              : "something went wrong. try again."}
        </p>
      )}
    </form>
  );
}
