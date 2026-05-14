import Link from "next/link";
import type { Metadata } from "next";
import { CaseSubmissionForm } from "@/components/CaseSubmissionForm";

export const metadata: Metadata = {
  title: "Submit a case",
};

export const dynamic = "force-dynamic";

// Free-tier case submission. Same form fields as the paid flow,
// without payment. POST → /api/case-files/submit with tier=free
// returns an in-app redirect URL (/case-files/submitted) rather than
// a Stripe Checkout URL.

export default function SubmitFreeCasePage() {
  return (
    <div className="rules-paper">
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Case Files</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Submit a case.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Free submissions go in the queue. The best ones become
            Case Files. Clay reads everything; review isn&apos;t
            guaranteed.
          </p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-8">
          <Link
            href="/case-files"
            className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.62rem", fontWeight: 600 }}
          >
            &larr; Back to Case Files
          </Link>
        </div>

        <CaseSubmissionForm tier="free" />
      </section>
    </div>
  );
}
