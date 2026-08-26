"use client";

import { useState } from "react";
import Link from "next/link";
import { AutoResizingTextarea } from "@/components/AutoResizingTextarea";

// Paid Case File submission form. Two variants share this component:
// Public Review ($25, with anonymization choice) and Private Review
// ($50, no anonymization). Submits to /api/case-files/submit which
// writes the record and returns a Stripe Checkout URL; we redirect
// the browser there.

const MAX_TITLE = 200;
const MAX_SITUATION = 1000;
const MAX_MOVE = 500;
const MAX_OPTIONAL = 500;

type Tier = "free" | "public_review" | "private_review";
type Anon = "full_name" | "first_name" | "anonymous";

function errorMessage(code: string): string {
  switch (code) {
    case "not_authenticated":
      return "Sign in first, then come back to submit.";
    case "missing_title":
      return "Give the case a short title.";
    case "missing_situation":
      return "Add the situation paragraph.";
    case "missing_move":
      return "Add the move the opponent made.";
    case "missing_anonymization":
      return "Pick how your name should appear on the published Case File.";
    case "storage_unavailable":
    case "stripe_not_configured":
    case "no_url_returned":
      return "Payments aren't configured on this deploy. Email clay@stopbeingprey.com.";
    default:
      return "Submission failed. Please try again, or email clay@stopbeingprey.com.";
  }
}

export function CaseSubmissionForm({ tier }: { tier: Tier }) {
  const priceLabel =
    tier === "public_review" ? "$25" : tier === "private_review" ? "$50" : null;
  const isPaid = tier !== "free";

  const [title, setTitle] = useState("");
  const [situation, setSituation] = useState("");
  const [move, setMove] = useState("");
  const [attemptedResponse, setAttemptedResponse] = useState("");
  const [helpWanted, setHelpWanted] = useState("");
  const [anonymization, setAnonymization] = useState<Anon>("first_name");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/case-files/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          title,
          situation,
          move,
          attemptedResponse,
          helpWanted,
          anonymization:
            tier === "public_review" || tier === "free"
              ? anonymization
              : undefined,
        }),
      });
      const data: { url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(errorMessage(data.error ?? "submit_failed"));
        setPending(false);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit_failed");
      setPending(false);
    }
  }

  const canSubmit =
    !pending && title.trim() && situation.trim() && move.trim();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <label className="block">
        <span className="eyebrow block mb-2">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
          maxLength={MAX_TITLE}
          placeholder="One line. What is the case about."
          disabled={pending}
          required
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem" }}
        />
      </label>

      <label className="block">
        <span className="eyebrow block mb-2">The situation</span>
        <AutoResizingTextarea
          value={situation}
          onChange={(e) =>
            setSituation(e.target.value.slice(0, MAX_SITUATION))
          }
          minRows={6}
          maxLength={MAX_SITUATION}
          placeholder="Set the scene. Who, where, what was being argued."
          disabled={pending}
          required
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
        <p
          className="font-serif italic text-ink-faint mt-2"
          style={{ fontSize: "0.78rem" }}
        >
          {situation.length} / {MAX_SITUATION}
        </p>
      </label>

      <label className="block">
        <span className="eyebrow block mb-2">The move</span>
        <AutoResizingTextarea
          value={move}
          onChange={(e) => setMove(e.target.value.slice(0, MAX_MOVE))}
          minRows={4}
          maxLength={MAX_MOVE}
          placeholder="What did the opponent do? Name the move as best you can."
          disabled={pending}
          required
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
        <p
          className="font-serif italic text-ink-faint mt-2"
          style={{ fontSize: "0.78rem" }}
        >
          {move.length} / {MAX_MOVE}
        </p>
      </label>

      <label className="block">
        <span className="eyebrow block mb-2">
          What you tried <span className="text-ink-faint">(optional)</span>
        </span>
        <AutoResizingTextarea
          value={attemptedResponse}
          onChange={(e) =>
            setAttemptedResponse(e.target.value.slice(0, MAX_OPTIONAL))
          }
          minRows={3}
          maxLength={MAX_OPTIONAL}
          placeholder="Your response, even if you walked away."
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
        <p
          className="font-serif italic text-ink-faint mt-2"
          style={{ fontSize: "0.78rem" }}
        >
          {attemptedResponse.length} / {MAX_OPTIONAL}
        </p>
      </label>

      <label className="block">
        <span className="eyebrow block mb-2">
          What you want help with{" "}
          <span className="text-ink-faint">(optional)</span>
        </span>
        <AutoResizingTextarea
          value={helpWanted}
          onChange={(e) =>
            setHelpWanted(e.target.value.slice(0, MAX_OPTIONAL))
          }
          minRows={3}
          maxLength={MAX_OPTIONAL}
          placeholder="The specific question. The one-shot you want, the framework you can't see."
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
        <p
          className="font-serif italic text-ink-faint mt-2"
          style={{ fontSize: "0.78rem" }}
        >
          {helpWanted.length} / {MAX_OPTIONAL}
        </p>
      </label>

      {(tier === "public_review" || tier === "free") && (
        <fieldset className="block">
          <legend className="eyebrow block mb-3">
            {tier === "public_review"
              ? "Anonymization on the published Case File"
              : "Anonymization if Clay turns this into a Case File"}
          </legend>
          <div className="flex flex-col gap-2">
            {(
              [
                { value: "full_name", label: "Use my full name" },
                { value: "first_name", label: "Use my first name only" },
                { value: "anonymous", label: "Anonymous" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="radio"
                  name="anonymization"
                  value={opt.value}
                  checked={anonymization === opt.value}
                  onChange={() => setAnonymization(opt.value)}
                  disabled={pending}
                />
                <span
                  className="font-serif text-ink"
                  style={{ fontSize: "0.98rem" }}
                >
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {isPaid && (
        <p
          className="font-serif italic text-ink-muted leading-relaxed"
          style={{ fontSize: "0.85rem" }}
        >
          Refund policy: full refund within 48 hours if work hasn&apos;t
          started. Pro-rated if Clay has begun the dissection. Email{" "}
          <a
            href="mailto:clay@stopbeingprey.com"
            className="text-eye-deep hover:text-ink"
            style={{ textDecoration: "underline" }}
          >
            clay@stopbeingprey.com
          </a>{" "}
          to request.
        </p>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href="/case-files"
          className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
          style={{ fontSize: "0.62rem", fontWeight: 600 }}
        >
          &larr; Cancel
        </Link>
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary"
          style={{
            opacity: canSubmit ? 1 : 0.6,
            cursor: pending ? "wait" : canSubmit ? "pointer" : "not-allowed",
          }}
        >
          <span>
            {pending
              ? isPaid
                ? "redirecting…"
                : "submitting…"
              : isPaid
                ? `Continue to payment · ${priceLabel} →`
                : "Submit case →"}
          </span>
        </button>
      </div>

      {error && (
        <p
          className="font-serif italic"
          style={{ color: "#7a3a2e", fontSize: "0.92rem" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
