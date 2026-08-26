"use client";

import { useState } from "react";
import { AutoResizingTextarea } from "@/components/AutoResizingTextarea";

const PRESET_AMOUNTS: ReadonlyArray<number> = [5, 10, 25, 50, 100];
const DEFAULT_PRESET = 10;
const NAME_MAX = 80;
const NOTE_MAX = 280;

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

export function WallDonateCard({
  wallSlug,
  noteGuidelines,
  urgencyLine,
}: {
  wallSlug: string;
  noteGuidelines?: string;
  urgencyLine?: string;
}) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(
    DEFAULT_PRESET
  );
  const [inputValue, setInputValue] = useState<string>(
    formatAmount(DEFAULT_PRESET)
  );
  const [name, setName] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [anonymous, setAnonymous] = useState(false);
  const [showAmount, setShowAmount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseAmount(inputValue);
  const amountValid = parsed !== null && parsed >= 1 && parsed <= 10000;
  const noteTrimmed = note.trim();
  const noteValid = noteTrimmed.length > 0;
  const isValid = amountValid && noteValid;

  function selectPreset(value: number) {
    setSelectedPreset(value);
    setInputValue(formatAmount(value));
    setError(null);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setInputValue(raw);
    const n = parseAmount(raw);
    setSelectedPreset(n !== null && PRESET_AMOUNTS.includes(n) ? n : null);
    setError(null);
  }

  async function handleDonate() {
    if (!isValid || parsed === null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/wall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wall_slug: wallSlug,
          amount: parsed,
          name: name.trim() || undefined,
          note: noteTrimmed,
          anonymous,
          show_amount: showAmount,
        }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setLoading(false);
    }
  }

  const buttonLabel = loading
    ? "Redirecting…"
    : parsed !== null && parsed > 0
      ? `Fund this — $${formatAmount(parsed)}`
      : "Fund this";

  return (
    <div className="flex flex-col items-center text-center">
      <p className="eyebrow mb-4">Card · Apple Pay · Google Pay</p>

      {urgencyLine && (
        <p
          className="font-display italic text-eye-deep mb-4"
          style={{ fontSize: "0.95rem", letterSpacing: "0.01em" }}
        >
          {urgencyLine}
        </p>
      )}

      {/* Preset buttons. $10 is the anchored default — pre-selected and
          visually emphasized via stronger border, bolder weight, and a
          subtle gold tint. We avoid a floating "Popular" pill because at
          mobile cell widths (~52px) the label would overflow into
          neighboring chips. */}
      <div
        className="grid grid-cols-5 gap-2 w-full max-w-md mb-4"
        role="group"
        aria-label="Preset donation amounts"
      >
        {PRESET_AMOUNTS.map((amount) => {
          const isSelected = selectedPreset === amount;
          const isAnchor = amount === DEFAULT_PRESET;
          return (
            <button
              key={amount}
              type="button"
              onClick={() => selectPreset(amount)}
              aria-pressed={isSelected}
              aria-label={isAnchor ? `$${amount} (popular)` : `$${amount}`}
              className={`py-2 w-full border font-display text-base transition-colors ${
                isSelected
                  ? "border-eye-deep bg-eye/15 text-ink"
                  : isAnchor
                    ? "border-eye-deep bg-eye/5 text-ink hover:bg-eye/10"
                    : "border-border bg-paper text-ink-muted hover:border-eye"
              }`}
              style={
                isAnchor
                  ? { borderWidth: "1.5px", fontWeight: 600 }
                  : undefined
              }
            >
              ${amount}
            </button>
          );
        })}
      </div>

      <p
        className="eyebrow text-center mb-5"
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.22em",
          lineHeight: 1.55,
        }}
      >
        One-time. No auto-renewal.
      </p>

      {/* Custom amount */}
      <label className="w-full max-w-sm mb-4">
        <span className="sr-only">Custom amount in US dollars</span>
        <div className="flex items-center border border-border bg-paper px-3 py-2 focus-within:border-eye transition-colors">
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

      {/* Name */}
      <label className="w-full max-w-sm mb-3 text-left">
        <span className="sr-only">Your name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          placeholder={anonymous ? "Hidden — posting anonymously" : "Your name"}
          maxLength={NAME_MAX}
          autoComplete="name"
          disabled={anonymous}
          className="w-full border border-border bg-paper px-3 py-2 outline-none focus:border-eye font-serif text-ink text-sm transition-colors disabled:opacity-50"
          aria-label="Your name"
        />
      </label>

      {/* Note (required) */}
      <div className="w-full max-w-sm mb-3 text-left">
        {noteGuidelines && (
          <p className="text-xs italic text-ink-muted leading-relaxed mb-2 px-px">
            {noteGuidelines}
          </p>
        )}
        <label>
          <span className="sr-only">Note for the wall (required)</span>
          <AutoResizingTextarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            placeholder="What do you want Marek to read?"
            minRows={3}
            maxLength={NOTE_MAX}
            required
            className="w-full border border-border bg-paper px-3 py-2 outline-none focus:border-eye font-serif text-ink text-sm leading-relaxed resize-none transition-colors"
            aria-label="Note for the wall"
          />
        </label>
        <div className="text-right text-[0.65rem] uppercase tracking-[0.14em] text-ink-faint mt-1">
          {note.length}/{NOTE_MAX}
        </div>
      </div>

      {/* Toggles */}
      <div className="w-full max-w-sm mb-6 text-left pl-3 flex flex-col gap-3">
        <label className="flex items-start gap-2 cursor-pointer text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showAmount}
            onChange={(e) => setShowAmount(e.target.checked)}
            className="mt-1 accent-eye-deep"
          />
          <span className="leading-snug">Show my donation amount on the wall</span>
        </label>

        <label className="flex items-start gap-2 cursor-pointer text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="mt-1 accent-eye-deep"
          />
          <span className="leading-snug">Post anonymously</span>
        </label>
      </div>

      <div className="w-full">
        <button
          type="button"
          onClick={handleDonate}
          disabled={!isValid || loading}
          className="btn-fund"
        >
          {buttonLabel}
        </button>
      </div>

      {!noteValid && amountValid && (
        <p className="text-xs italic text-ink-faint mt-3">
          A note is required — your words are part of the artifact.
        </p>
      )}

      {error && (
        <p
          className="text-sm italic mt-4 max-w-xs leading-relaxed"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
