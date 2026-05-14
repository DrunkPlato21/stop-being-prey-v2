"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  anonymizationLabel,
  statusLabel,
  tierLabel,
  type Anonymization,
  type CaseStatus,
  type CaseTier,
} from "@/lib/case-submissions";

// One row of the /admin/case-submissions inbox. Shows the full case
// content (no separate detail page in V1 — keeps everything on one
// scrollable surface) and offers status mutation buttons that POST
// to /api/admin/case-submissions/[id].

type Row = {
  id: string;
  memberEmail: string;
  memberDisplayName: string;
  tier: CaseTier;
  title: string;
  situation: string;
  move: string;
  attemptedResponse: string;
  helpWanted: string;
  anonymization: Anonymization | null;
  status: CaseStatus;
  stripeAmountCents: number | null;
  createdAt: number;
  paidAt: number | null;
  completedAt: number | null;
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(cents: number | null): string | null {
  if (cents === null || cents === 0) return null;
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  submitted: ["in_review", "refunded"],
  paid: ["in_review", "refunded"],
  in_review: ["published", "completed", "refunded"],
  published: ["completed"],
  completed: [],
  refunded: [],
};

export function CaseSubmissionRow({ row }: { row: Row }) {
  const router = useRouter();
  const [status, setStatus] = useState<CaseStatus>(row.status);
  const [pending, setPending] = useState<CaseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(next: CaseStatus) {
    if (pending) return;
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/api/admin/case-submissions/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "save_failed");
        return;
      }
      setStatus(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setPending(null);
    }
  }

  const amount = formatMoney(row.stripeAmountCents);
  const nextSteps = TRANSITIONS[status];

  return (
    <article className="py-7 border-t border-rule">
      {/* Header strip: tier + status + member + timestamp */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="font-display uppercase"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.24em",
              fontWeight: 700,
              color: "var(--eye-deep)",
            }}
          >
            {tierLabel(row.tier)}
          </span>
          {amount && (
            <span
              className="font-display"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--eye-deep)",
              }}
            >
              {amount}
            </span>
          )}
          <span
            className="font-display uppercase text-ink-muted"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.22em",
              fontWeight: 600,
            }}
          >
            &middot; {statusLabel(status)}
          </span>
        </div>
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.78rem" }}
        >
          {formatTime(row.createdAt)}
        </span>
      </div>

      {/* Title + member identity */}
      <h3
        className="font-display text-ink leading-tight tracking-tight mb-1.5"
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          letterSpacing: "-0.012em",
        }}
      >
        {row.title}
      </h3>
      <p
        className="font-serif italic text-ink-muted mb-5"
        style={{ fontSize: "0.88rem" }}
      >
        {row.memberDisplayName || "(no display name)"}{" "}
        <span className="text-ink-faint">&lt;{row.memberEmail}&gt;</span>
        {row.anonymization && (
          <>
            {" "}
            &middot;{" "}
            <span className="text-ink-faint">
              Anonymization: {anonymizationLabel(row.anonymization)}
            </span>
          </>
        )}
      </p>

      {/* Field blocks */}
      <FieldBlock label="The situation" body={row.situation} />
      <FieldBlock label="The move" body={row.move} />
      {row.attemptedResponse && (
        <FieldBlock label="What they tried" body={row.attemptedResponse} />
      )}
      {row.helpWanted && (
        <FieldBlock
          label="What they want help with"
          body={row.helpWanted}
        />
      )}

      {/* Action row */}
      <div className="flex items-center flex-wrap gap-3 mt-5">
        {nextSteps.length === 0 ? (
          <span
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.85rem" }}
          >
            No further status changes from here.
          </span>
        ) : (
          nextSteps.map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => mutate(next)}
              disabled={pending !== null}
              className="font-display uppercase tracking-[0.22em] transition-colors"
              style={{
                fontSize: "0.62rem",
                letterSpacing: "0.22em",
                fontWeight: 600,
                padding: "0.5rem 0.85rem",
                border: "1px solid var(--eye-deep)",
                background: "var(--paper)",
                color: "var(--eye-deep)",
                cursor: pending !== null ? "wait" : "pointer",
                opacity: pending !== null && pending !== next ? 0.5 : 1,
              }}
            >
              {pending === next ? "saving…" : `Mark ${statusLabel(next)}`}
            </button>
          ))
        )}
        <a
          href={`mailto:${row.memberEmail}?subject=${encodeURIComponent(
            `Re: ${row.title}`
          )}`}
          className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors ml-auto"
          style={{ fontSize: "0.62rem", fontWeight: 600 }}
        >
          email member &rarr;
        </a>
      </div>

      {error && (
        <p
          className="font-serif italic mt-3"
          style={{ color: "#7a3a2e", fontSize: "0.85rem" }}
        >
          Couldn&apos;t save. Try again.
        </p>
      )}
    </article>
  );
}

function FieldBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="mb-4">
      <p
        className="eyebrow mb-1.5"
        style={{ fontSize: "0.6rem", letterSpacing: "0.22em" }}
      >
        {label}
      </p>
      <p
        className="font-serif text-ink whitespace-pre-wrap leading-relaxed"
        style={{ fontSize: "0.96rem" }}
      >
        {body}
      </p>
    </div>
  );
}
