import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CaseSubmissionForm } from "@/components/CaseSubmissionForm";

export const metadata: Metadata = {
  title: "Submit a case",
};

export const dynamic = "force-dynamic";

// URL slug -> internal tier id. The slug is intentionally shorter
// than the storage value to keep the URL clean.
const TIERS: Record<string, "public_review" | "private_review"> = {
  public: "public_review",
  private: "private_review",
};

type Params = { tier: string };

export default async function SubmitCasePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tier: rawTier } = await params;
  const tier = TIERS[rawTier];
  if (!tier) notFound();

  const isPublic = tier === "public_review";
  const priceLabel = isPublic ? "$25" : "$50";
  const tierLabel = isPublic ? "Public Review" : "Private Review";
  const blurb = isPublic
    ? "Becomes a public Case File. You choose how your name shows up. Guaranteed dissection within 2 business days."
    : "Stays private, just for you. Guaranteed dissection within 2 business days.";

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
            {tierLabel}.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">{blurb}</p>
          <p
            className="font-display uppercase text-eye-deep mt-5"
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.28em",
              fontWeight: 700,
            }}
          >
            {priceLabel} &middot; one-time
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

        <CaseSubmissionForm tier={tier} />
      </section>
    </div>
  );
}
