"use client";

import { useState } from "react";
import { GiftForm } from "@/components/GiftForm";
import { PoolFundForm } from "@/components/PoolFundForm";

// Two ways to pay a seat forward on the same page. "I know who it's for"
// is the named gift (existing GiftForm). "Fund a seat for someone who
// can't afford one" is the anonymous pool (PoolFundForm). The toggle
// just swaps which form is shown; each form owns its own checkout.
// COPY IS DRAFT — Clay finalizes.

type Mode = "named" | "pool";

const MODES: { key: Mode; label: string; sub: string }[] = [
  { key: "named", label: "I know who it's for", sub: "name them" },
  {
    key: "pool",
    label: "Fund a seat for someone who can't afford one",
    sub: "anonymous, claimed privately",
  },
];

export function GiveModeToggle() {
  const [mode, setMode] = useState<Mode>("named");

  return (
    <div className="w-full">
      <div
        className="max-w-md mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10"
        role="radiogroup"
        aria-label="how you want to give"
      >
        {MODES.map((m) => {
          const selected = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(m.key)}
              className={`border px-4 py-4 text-left transition-colors ${
                selected
                  ? "border-ink bg-surface"
                  : "border-rule bg-paper hover:border-ink"
              }`}
            >
              <span
                className={`block font-display leading-tight mb-1 ${
                  selected ? "text-ink" : "text-ink-muted"
                }`}
                style={{ fontSize: "0.98rem", fontWeight: 700 }}
              >
                {m.label}
              </span>
              <span
                className="block font-serif italic text-ink-faint"
                style={{ fontSize: "0.82rem" }}
              >
                {m.sub}
              </span>
            </button>
          );
        })}
      </div>

      {mode === "named" ? <GiftForm /> : <PoolFundForm />}
    </div>
  );
}
