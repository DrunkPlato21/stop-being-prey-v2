import Link from "next/link";
import Stripe from "stripe";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thank you",
  description: "Reader-supported. Thank you for backing the work.",
};

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    })
  : null;

function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}

async function getAmountFromSession(
  sessionId: string | undefined
): Promise<string | null> {
  if (!sessionId || !stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (typeof session.amount_total !== "number") return null;
    return formatUsd(session.amount_total);
  } catch {
    return null;
  }
}

export default async function TipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const amount = await getAmountFromSession(session_id);

  return (
    <div>
      <section className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-16 text-center">
        <div className="bg-surface border border-border p-10 md:p-14 relative">
          {/* Cat-eye corner ornaments */}
          <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
          <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
          <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
          <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

          <p className="eyebrow mb-6 fade-up stagger-1">Thank you</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            Your support means more than you know.
          </h1>
          <p className="deck max-w-xl mx-auto mb-8 fade-up stagger-3">
            The work continues because of readers like you.
          </p>

          {amount && (
            <p
              className="font-display italic text-ink leading-relaxed fade-up stagger-4"
              style={{ fontSize: "1.15rem", fontWeight: 500 }}
            >
              You contributed {amount}.
            </p>
          )}
        </div>

        <div className="mt-12">
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← Back to Stop Being Prey
          </Link>
        </div>
      </section>
    </div>
  );
}
