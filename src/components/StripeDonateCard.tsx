"use client";

import { useState } from "react";

const PRESETS = [5, 10, 20, 50, 100];

function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(raw.trim())) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function StripeDonateCard() {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseAmount(inputValue);
  const isValid = parsed !== null && parsed >= 1 && parsed <= 10000;

  function selectPreset(value: number) {
    setSelectedPreset(value);
    setInputValue(formatAmount(value));
    setError(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setInputValue(raw);
    const n = parseAmount(raw);
    setSelectedPreset(n !== null && PRESETS.includes(n) ? n : null);
    setError(null);
  }

  async function handleDonate() {
    if (!isValid || parsed === null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsed }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setLoading(false);
    }
  }

  const buttonLabel = loading
    ? "Redirecting…"
    : parsed !== null && parsed > 0
      ? `Donate $${formatAmount(parsed)}`
      : "Donate";

  return (
    <div className="bg-surface border border-border p-8 md:p-10 relative">
      {/* Cat-eye corner ornaments */}
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

      <div className="flex flex-col items-center text-center">
        <p className="eyebrow mb-3">Card · Apple Pay · Google Pay</p>
        <h3
          className="font-display text-ink leading-tight tracking-tight mb-6"
          style={{
            fontSize: "1.85rem",
            fontWeight: 700,
            letterSpacing: "-0.015em",
          }}
        >
          Tip in fiat
        </h3>

        <p
          className="font-display text-ink leading-snug max-w-xs mx-auto mb-6"
          style={{ fontSize: "1.1rem", fontWeight: 400, fontStyle: "italic" }}
        >
          Pick an amount, or enter your own.
        </p>

        {/* Preset buttons */}
        <div
          className="grid grid-cols-5 gap-2 w-full max-w-sm mb-5"
          role="group"
          aria-label="Preset donation amounts"
        >
          {PRESETS.map((amount) => {
            const isSelected = selectedPreset === amount;
            const presetStyle: React.CSSProperties = {
              padding: "0.55rem 0.25rem",
              fontSize: "0.72rem",
              letterSpacing: "0.14em",
              justifyContent: "center",
            };
            return (
              <button
                key={amount}
                type="button"
                onClick={() => selectPreset(amount)}
                aria-pressed={isSelected}
                className={isSelected ? "btn-primary" : "btn-secondary"}
                style={presetStyle}
              >
                {isSelected ? <span>${amount}</span> : <>${amount}</>}
              </button>
            );
          })}
        </div>

        {/* Custom amount input */}
        <label className="w-full max-w-sm mb-6">
          <span className="sr-only">Custom amount in US dollars</span>
          <div
            className="flex items-center border border-border bg-paper px-3 py-2 focus-within:border-eye transition-colors"
          >
            <span
              className="font-display text-ink-muted mr-2"
              style={{ fontSize: "1.05rem", fontWeight: 500 }}
            >
              $
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Custom amount"
              value={inputValue}
              onChange={handleInputChange}
              className="flex-1 bg-transparent outline-none font-serif text-ink text-base"
              aria-label="Custom donation amount in US dollars"
            />
          </div>
        </label>

        {/* Donate button */}
        <button
          type="button"
          onClick={handleDonate}
          disabled={!isValid || loading}
          className="btn-primary"
          style={
            !isValid || loading
              ? { opacity: 0.5, cursor: "not-allowed" }
              : undefined
          }
        >
          <span>{buttonLabel}</span>
        </button>

        {error && (
          <p className="text-sm italic text-ink-soft mt-4 max-w-xs leading-relaxed" style={{ color: "#7a3a2e" }}>
            {error}
          </p>
        )}

        <p className="text-sm text-ink-muted italic mt-6 max-w-xs leading-relaxed">
          Secure checkout powered by Stripe. One-time tip. Any amount from $1 to
          $10,000.
        </p>
      </div>
    </div>
  );
}
