"use client";

import { useState } from "react";

// The single "back a seat" control for the pool. One amount, any size:
// a few dollars pools toward a seat, a whole seat ($39) funds one now.
// Presets + an optional custom amount post to /api/pool/contribute and
// redirect to Stripe. This is the only pool give-path — the old separate
// full-seat form folded into it, since with the pot a whole seat is just
// a $39 contribution. COPY IS DRAFT — Clay finalizes.

type Status = "idle" | "loading" | "error";

const PRESETS: { dollars: number; note?: string }[] = [
  { dollars: 5 },
  { dollars: 25 },
  { dollars: 39, note: "a full seat" },
];

export function PoolChipInForm({
  floorCents,
}: {
  floorCents: number;
}) {
  const floorDollars = Math.ceil(floorCents / 100);
  const [dollars, setDollars] = useState<number>(PRESETS[1].dollars);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Custom field, when filled, wins over the preset selection.
  const customNum = custom.trim() === "" ? null : Number(custom);
  const effectiveDollars =
    customNum !== null && Number.isFinite(customNum) ? customNum : dollars;
  const amountCents = Math.round(effectiveDollars * 100);
  const belowFloor = amountCents < floorCents;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "loading") return;
    if (belowFloor || !Number.isFinite(amountCents) || amountCents <= 0) {
      setError("below_floor");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/pool/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data: { url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? "request_failed");
      window.location.href = data.url;
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "request_failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <div
        className="grid grid-cols-3 gap-3 mb-4"
        role="radiogroup"
        aria-label="chip-in amount"
      >
        {PRESETS.map((p) => {
          const selected = customNum === null && dollars === p.dollars;
          return (
            <button
              key={p.dollars}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setDollars(p.dollars);
                setCustom("");
              }}
              className={`border px-4 py-3 text-center transition-colors ${
                selected
                  ? "border-ink bg-ink text-paper"
                  : "border-rule bg-paper text-ink hover:border-ink"
              }`}
            >
              <span
                className="block font-display leading-none"
                style={{ fontSize: "1.15rem", fontWeight: 700 }}
              >
                ${p.dollars}
              </span>
              <span
                className={`block font-serif italic mt-1 ${
                  selected ? "" : "text-ink-faint"
                }`}
                style={{ fontSize: "0.72rem", minHeight: "0.9em" }}
              >
                {p.note ?? ""}
              </span>
            </button>
          );
        })}
      </div>

      <label className="block mb-6">
        <span className="eyebrow block mb-2">or another amount</span>
        <div className="flex items-center border border-rule bg-paper focus-within:border-ink transition-colors">
          <span className="pl-4 pr-1 font-display text-ink-muted" style={{ fontSize: "1.05rem" }}>
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={floorDollars}
            step="1"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={status === "loading"}
            placeholder={String(floorDollars)}
            className="flex-1 bg-transparent px-1 py-3 text-ink placeholder:text-ink-faint focus:outline-none font-serif text-base disabled:opacity-60"
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={status === "loading" || belowFloor}
        className="w-full bg-ink text-paper hover:bg-eye-deep px-6 py-4 font-display transition-colors text-sm uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontWeight: 600 }}
      >
        {status === "loading"
          ? "One moment..."
          : `Put in $${Number.isFinite(effectiveDollars) ? effectiveDollars : 0}`}
      </button>

      <p
        className="font-serif italic text-ink-faint text-center mt-3"
        style={{ fontSize: "0.82rem" }}
      >
        one charge. a whole seat is $39: a season, three months in the room
        for a reader who can&apos;t afford it. smaller amounts pool toward one.
      </p>

      {status === "error" && error && (
        <p
          className="mt-3 font-serif italic text-sm text-center"
          style={{ color: "#7a3a2e" }}
        >
          {error === "below_floor"
            ? `the smallest chip-in is $${floorDollars}.`
            : error === "above_ceiling"
              ? "that's a large amount for a chip-in. fund a full seat instead?"
              : error === "storage_unavailable"
                ? "the desk isn't reachable. try again in a moment."
                : "something went wrong. try again."}
        </p>
      )}
      {belowFloor && status !== "error" && (
        <p
          className="mt-3 font-serif italic text-sm text-center text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          the smallest chip-in is ${floorDollars}.
        </p>
      )}
    </form>
  );
}
