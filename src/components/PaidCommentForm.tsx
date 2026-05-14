"use client";

import { useState } from "react";
import type { CommentKind } from "@/lib/comments";

// Non-member paid-comment form. Renders below the value prop ("Members
// comment free / Non-members: $1") in the Comments section. Submits
// to /api/paid-comments/create which writes a draft + creates a $1
// Stripe Checkout; we hard-redirect to the returned URL.
//
// Plain-text only, same intentional voice as the member CommentForm.
// Display name validation, reserved + profanity filter, and the
// per-piece comment lock all run server-side.

type Props = {
  kind: CommentKind;
  slug: string;
};

const ERRORS: Record<string, string> = {
  invalid_email: "Add a valid email address.",
  display_name_required: "Pick a display name.",
  invalid_display_name: "That display name isn't allowed.",
  reserved: "That name is reserved. Try another.",
  profanity: "That name isn't allowed. Try another.",
  name_taken: "Someone's already using that name on the site. Try another.",
  invalid_body_field: "Write the comment first.",
  empty_body: "Write the comment first.",
  already_commented:
    "There's already a comment from this email on this piece. One per piece, even from non-members.",
  storage_unavailable: "Storage is temporarily down. Try again.",
  unknown_piece: "Couldn't find this piece. Refresh the page.",
  stripe_not_configured: "Payments are temporarily disabled.",
  invalid_amount: "Couldn't set up the payment. Try again.",
  no_url_returned: "Couldn't reach Stripe. Try again.",
};

// $1 floor matching PAID_COMMENT_MIN_CENTS on the server. The form
// holds the dollar value as a string so the input can render "1"
// cleanly without coercing partial decimals like "1." to NaN
// mid-typing. Parsed + validated on submit.
const MIN_DOLLARS = 1;

function parseAmountDollars(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < MIN_DOLLARS) return null;
  return n;
}

function formatAmountForButton(raw: string): string {
  const n = parseAmountDollars(raw) ?? MIN_DOLLARS;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function PaidCommentForm({ kind, slug }: Props) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [amountInput, setAmountInput] = useState("1");
  const [showAmount, setShowAmount] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!email.trim()) {
      setError(ERRORS.invalid_email);
      return;
    }
    if (!displayName.trim()) {
      setError(ERRORS.display_name_required);
      return;
    }
    if (!body.trim()) {
      setError(ERRORS.empty_body);
      return;
    }
    const dollars = parseAmountDollars(amountInput);
    if (dollars === null) {
      setError(ERRORS.invalid_amount);
      return;
    }
    const amountCents = Math.round(dollars * 100);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/paid-comments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          kind,
          slug,
          body,
          amountCents,
          showAmount,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(
          (data.error && ERRORS[data.error]) ||
            "Couldn't start the payment. Try again."
        );
        setPending(false);
        return;
      }
      // Hard redirect to Stripe Checkout. No router.push — we're
      // leaving Next.js for a beat.
      window.location.href = data.url;
    } catch {
      setError("Couldn't start the payment. Try again.");
      setPending(false);
    }
  }

  const buttonAmount = formatAmountForButton(amountInput);

  return (
    <form
      onSubmit={handleSubmit}
      className="text-left flex flex-col gap-4 max-w-xl mx-auto"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-2">
          <span
            className="eyebrow"
            style={{ fontSize: "0.65rem", letterSpacing: "0.22em" }}
          >
            Display name
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            placeholder="How you'll appear"
            disabled={pending}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink"
            style={{ fontSize: "1rem" }}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span
            className="eyebrow"
            style={{ fontSize: "0.65rem", letterSpacing: "0.22em" }}
          >
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={pending}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink"
            style={{ fontSize: "1rem" }}
          />
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span
          className="eyebrow"
          style={{ fontSize: "0.65rem", letterSpacing: "0.22em" }}
        >
          Your comment
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={1500}
          placeholder="One per piece. Make it count."
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </label>
      {/* Variable-amount block. $1 floor enforced both here and on
          the API. Show-amount checkbox controls whether the GUEST
          badge later prints the dollar figure publicly. */}
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 flex-wrap">
          <span
            className="eyebrow"
            style={{ fontSize: "0.65rem", letterSpacing: "0.22em" }}
          >
            Amount
          </span>
          <span className="inline-flex items-baseline gap-1">
            <span
              className="font-serif text-ink"
              style={{ fontSize: "1rem" }}
              aria-hidden="true"
            >
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={MIN_DOLLARS}
              step="1"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={pending}
              aria-label="Contribution amount in US dollars"
              className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink"
              style={{ fontSize: "1rem", width: "5.5rem" }}
            />
          </span>
          <span
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.8rem" }}
          >
            $1 minimum
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showAmount}
            onChange={(e) => setShowAmount(e.target.checked)}
            disabled={pending}
            className="cursor-pointer"
          />
          <span
            className="font-serif text-ink-muted"
            style={{ fontSize: "0.92rem" }}
          >
            Show my contribution amount publicly
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / 1500
        </span>
        <button
          type="submit"
          disabled={pending}
          className="cta-prestige"
          style={{
            opacity: pending ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>
            {pending ? "Opening Stripe…" : `Pay ${buttonAmount} & Comment`}
          </span>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
      <p
        className="font-serif italic text-ink-faint"
        style={{ fontSize: "0.78rem" }}
      >
        Clay reviews every comment before it goes live. Your contribution
        goes toward keeping the comment queue something worth reading.
      </p>
      {error && (
        <p
          className="font-serif italic"
          style={{ fontSize: "0.88rem", color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
