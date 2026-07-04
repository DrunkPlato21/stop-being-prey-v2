"use client";

import { useState } from "react";

// PROTOTYPE — the "sign the wall" card. Support-first: the act is backing
// the work with a dollar, and your name goes on the wall. Leaving a line is
// an invitation, never a requirement — a quiet supporter gives in one click
// and never has to find something clever to say. Posts to the same
// /api/checkout/donate endpoint, always display_publicly (the wall is the
// point), message OPTIONAL.

type AttributionPreference =
  | "full"
  | "first_last_initial"
  | "first"
  | "anonymous";

const ATTRIBUTION_OPTIONS: Array<{
  value: AttributionPreference;
  label: string;
}> = [
  { value: "full", label: "Full name + city" },
  { value: "first_last_initial", label: "First + last initial" },
  { value: "first", label: "First name" },
  { value: "anonymous", label: "Anonymous" },
];

// Plain amounts. No ranks, no captions — the dollar is the floor, not a
// status you're buying. $1 is genuinely enough.
const PRESETS: ReadonlyArray<number> = [1, 5, 20, 50];

const MESSAGE_MAX = 250;
const NAME_MAX = 80;
const CITY_MAX = 80;

function parseAmount(raw: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(raw.trim())) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function SignTheWall() {
  const [amount, setAmount] = useState<number>(1);
  const [custom, setCustom] = useState<string>("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [attribution, setAttribution] =
    useState<AttributionPreference>("first");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when the last edit hit the cap (typed or pasted past 240), so we
  // can tell the writer their line was trimmed instead of silently dropping
  // the overflow. Clears itself the moment they edit back under the limit.
  const [messageTrimmed, setMessageTrimmed] = useState(false);

  const effectiveAmount = custom.trim() ? parseAmount(custom) : amount;
  const amountValid =
    effectiveAmount !== null &&
    effectiveAmount >= 1 &&
    effectiveAmount <= 10000;
  const canSign = amountValid && !loading;

  function selectPreset(value: number) {
    setAmount(value);
    setCustom("");
    setError(null);
  }

  async function handleSign() {
    if (!canSign || effectiveAmount === null) return;
    setLoading(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const trimmedMessage = message.trim();
      const trimmedCity = city.trim();
      const res = await fetch("/api/checkout/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: effectiveAmount,
          name: trimmedName || undefined,
          message: trimmedMessage || undefined,
          display_publicly: true,
          attribution_preference: trimmedName ? attribution : "anonymous",
          city:
            attribution === "full" && trimmedCity ? trimmedCity : undefined,
        }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  const buttonAmount =
    effectiveAmount !== null && effectiveAmount > 0
      ? `$${Number.isInteger(effectiveAmount) ? effectiveAmount : effectiveAmount.toFixed(2)}`
      : "$1";

  // The act self-labels: a bare gift is "Send $X"; the moment they add a
  // name or a line, they're putting a mark on the wall.
  const leavingMark = name.trim().length > 0 || message.trim().length > 0;
  const buttonLabel = loading
    ? "Redirecting…"
    : leavingMark
      ? `Sign the wall — ${buttonAmount}`
      : `Send ${buttonAmount}`;

  return (
    <div className="bg-surface border border-border relative max-w-xl mx-auto p-8 md:p-10">
      {/* Cat-eye corner ornaments, matching the tip card */}
      <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
      <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
      <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
      <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

      <p className="eyebrow text-center mb-3">Add your name</p>
      <p
        className="font-display text-ink-muted italic text-center leading-snug max-w-sm mx-auto mb-7"
        style={{ fontSize: "1.05rem", fontWeight: 400 }}
      >
        A dollar puts you on the wall. That&apos;s the whole thing.
      </p>

      {/* Amount — plain, $1 leads */}
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        {PRESETS.map((a) => {
          const selected = !custom.trim() && amount === a;
          return (
            <button
              key={a}
              type="button"
              onClick={() => selectPreset(a)}
              aria-pressed={selected}
              className={`font-display px-5 py-2.5 border transition-colors ${
                selected
                  ? "border-eye-deep text-eye-deep"
                  : "border-rule text-ink hover:border-eye"
              }`}
              style={{ fontSize: "1.05rem", fontWeight: 700 }}
            >
              ${a}
            </button>
          );
        })}
      </div>

      {/* Custom amount */}
      <label className="block max-w-[10rem] mx-auto mb-6">
        <span className="sr-only">Custom amount in US dollars</span>
        <div className="flex items-center border border-border bg-paper px-3 py-2 focus-within:border-eye transition-colors">
          <span
            className="font-display text-ink-muted mr-1.5"
            style={{ fontSize: "0.95rem", fontWeight: 500 }}
          >
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="other"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setError(null);
            }}
            className="flex-1 min-w-0 bg-transparent outline-none font-serif text-ink text-sm"
            aria-label="Custom amount in US dollars"
          />
        </div>
      </label>

      {/* The skip signpost — makes the simple, private path obvious instead
          of merely possible. The fields below are the wall; this says you
          don't have to touch them. */}
      <p className="text-xs italic text-ink-faint text-center mb-5 leading-relaxed">
        Just want to support? Skip the rest — your tip still lands.
      </p>

      {/* Name + attribution */}
      <label className="block mb-3 text-left">
        <span className="sr-only">Your name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          placeholder="Your name (or stay anonymous)"
          maxLength={NAME_MAX}
          autoComplete="name"
          className="w-full border border-border bg-paper px-3 py-2 outline-none focus:border-eye font-serif text-ink text-sm transition-colors"
          aria-label="Your name (optional)"
        />
      </label>

      {name.trim() && (
        <div className="mb-4 text-left">
          <p
            className="eyebrow mb-2"
            style={{ letterSpacing: "0.2em", fontSize: "0.6rem" }}
          >
            Show me as
          </p>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAttribution(opt.value)}
                aria-pressed={attribution === opt.value}
                className={`px-3 py-1.5 text-xs border transition-colors ${
                  attribution === opt.value
                    ? "border-eye-deep text-eye-deep"
                    : "border-rule text-ink-muted hover:border-eye"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {attribution === "full" && (
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value.slice(0, CITY_MAX))}
              placeholder="City"
              maxLength={CITY_MAX}
              autoComplete="address-level2"
              className="mt-3 w-full border border-border bg-paper px-3 py-2 outline-none focus:border-eye font-serif text-ink text-sm transition-colors"
              aria-label="City"
            />
          )}
        </div>
      )}

      {/* Optional line — an invitation, clearly not required */}
      <label className="block mb-6 text-left">
        <span
          className="eyebrow block mb-2"
          style={{ letterSpacing: "0.2em", fontSize: "0.6rem" }}
        >
          Leave a line — optional
        </span>
        {/* maxLength is deliberately omitted: with it, the browser truncates a
            long paste BEFORE onChange fires, so we could never tell the writer
            it happened. Instead we slice in JS and compare against the raw
            length to detect (and announce) the trim. */}
        <textarea
          value={message}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.length > MESSAGE_MAX) {
              setMessage(raw.slice(0, MESSAGE_MAX));
              setMessageTrimmed(true);
            } else {
              setMessage(raw);
              setMessageTrimmed(false);
            }
          }}
          placeholder="What brought you here, if you feel like saying."
          rows={2}
          aria-describedby="wall-line-count wall-line-trim"
          className="w-full border border-border bg-paper px-3 py-2 outline-none focus:border-eye font-serif text-ink text-sm leading-relaxed resize-none transition-colors"
          aria-label="Leave a line (optional)"
        />
        {/* Trim notice (left) + live counter (right). The counter shows the
            limit from an empty box on, so the cap is never a surprise; it
            turns warning-colored once the line is full. */}
        <div className="flex items-baseline justify-between gap-3 mt-1.5">
          <span
            id="wall-line-trim"
            aria-live="polite"
            className="text-xs italic leading-snug"
            style={{ color: "#7a3a2e" }}
          >
            {messageTrimmed
              ? "That's the limit. Your line was trimmed to fit."
              : ""}
          </span>
          <span
            id="wall-line-count"
            className="text-xs font-serif tabular-nums shrink-0"
            style={{
              color:
                message.length >= MESSAGE_MAX
                  ? "#7a3a2e"
                  : "var(--ink-faint)",
            }}
          >
            {message.length} / {MESSAGE_MAX}
          </span>
        </div>
      </label>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSign}
          disabled={!canSign}
          className="btn-primary"
          style={!canSign ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          <span>{buttonLabel}</span>
        </button>
      </div>

      {error && (
        <p
          className="text-sm italic text-center mt-4"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}

      <p className="text-xs italic text-ink-faint text-center mt-6 leading-relaxed">
        One-time. No recurring charge. The amount is never shown. If you leave
        a line, it goes up after a quick check.
      </p>
    </div>
  );
}
