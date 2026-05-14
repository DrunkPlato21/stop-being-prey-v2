import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your case is in",
};

export const dynamic = "force-dynamic";

// Stripe success_url lands here. We deliberately don't read the
// session_id here — the webhook is authoritative for marking the
// case as paid + sending emails. This page is a confirmation
// surface only; if the user reloads it before the webhook fires
// there's no race because nothing on this page reads case state.

export default function CaseFilesSubmittedPage() {
  return (
    <div className="rules-paper">
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Case Files</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Your case is in.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Clay will respond within 2 business days. You&apos;ll
            receive his dissection by email.
          </p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-14 md:py-20">
        <div
          className="px-7 py-9 md:px-10 md:py-11 border border-rule"
          style={{ background: "var(--paper-deep)" }}
        >
          <p
            className="font-serif text-ink leading-relaxed mb-5"
            style={{ fontSize: "1.05rem" }}
          >
            Receipt is on its way to your inbox. The case is on the
            desk, queued in order received.
          </p>
          <p
            className="font-serif italic text-ink-muted leading-relaxed"
            style={{ fontSize: "0.95rem" }}
          >
            Refund policy: full refund within 48 hours if work
            hasn&apos;t started. Pro-rated if Clay has begun the
            dissection. Email{" "}
            <a
              href="mailto:clay@stopbeingprey.com"
              className="text-eye-deep hover:text-ink"
              style={{ textDecoration: "underline" }}
            >
              clay@stopbeingprey.com
            </a>{" "}
            to request.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/case-files"
            className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.7rem", fontWeight: 600 }}
          >
            Back to Case Files &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
