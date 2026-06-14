"use client";

import { useState } from "react";

// Give-side form for the ANONYMOUS pool path: fund a seat for someone
// who can't afford one. No recipient — the seat enters the pool and is
// claimed privately later. Term toggle (+ optional from-name) posts to
// /api/pool/fund-checkout and redirects to Stripe. The term-toggle
// markup mirrors GiftForm by design (pattern replication, not a shared
// abstraction). COPY IS DRAFT — Clay finalizes.

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

type Status = "idle" | "loading" | "error";

const MAX_SEATS = 25;

export function PoolFundForm() {
  const [months, setMonths] = useState<3 | 12>(12);
  const [seats, setSeats] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const perSeat = months === 3 ? 39 : 130;
  const total = perSeat * seats;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/pool/fund-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termMonths: months,
          seats,
          buyerName: buyerName || undefined,
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
      {/* DRAFT copy — Clay finalizes. */}
      <p
        className="font-serif text-ink-muted leading-relaxed mb-6 text-center"
        style={{ fontSize: "1rem" }}
      >
        Fund a seat, and someone who can&apos;t afford it gets to be in the
        room. No name needed. It waits in the pool until they claim it,
        privately. You&apos;ll never see who, and they&apos;ll never see you.
      </p>

      {/* Term toggle */}
      <div
        className="grid grid-cols-2 gap-3 mb-6"
        role="radiogroup"
        aria-label="seat term"
      >
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

      {/* How many seats */}
      <div className="flex items-center justify-between mb-6">
        <span className="eyebrow">how many seats?</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="one fewer seat"
            onClick={() => setSeats((s) => Math.max(1, s - 1))}
            disabled={status === "loading" || seats <= 1}
            className="border border-rule w-9 h-9 font-display text-ink hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed leading-none"
            style={{ fontSize: "1.2rem" }}
          >
            −
          </button>
          <span
            className="font-display text-ink text-center"
            style={{ fontSize: "1.2rem", fontWeight: 700, minWidth: "2ch" }}
          >
            {seats}
          </span>
          <button
            type="button"
            aria-label="one more seat"
            onClick={() => setSeats((s) => Math.min(MAX_SEATS, s + 1))}
            disabled={status === "loading" || seats >= MAX_SEATS}
            className="border border-rule w-9 h-9 font-display text-ink hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed leading-none"
            style={{ fontSize: "1.2rem" }}
          >
            +
          </button>
        </div>
      </div>

      {/* From name (optional, for Clay's records / the thank-you) */}
      <label className="block mb-6">
        <span className="eyebrow block mb-2">from (optional)</span>
        <input
          type="text"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          disabled={status === "loading"}
          maxLength={80}
          placeholder="a name for the thank-you"
          className="w-full border border-rule bg-paper px-4 py-3 text-ink placeholder:text-ink-faint focus:outline-none focus:border-ink focus:bg-surface transition-colors font-serif text-base disabled:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontWeight: 600 }}
      >
        {status === "loading"
          ? "One moment..."
          : seats > 1
            ? `Fund ${seats} seats · $${total}`
            : "Fund a seat"}
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
          {error === "storage_unavailable"
            ? "the desk isn't reachable. try again in a moment."
            : "something went wrong. try again."}
        </p>
      )}
    </form>
  );
}
