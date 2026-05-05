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

type SessionInfo = {
  amount: string | null;
  donorName: string | null;
  donorMessage: string | null;
};

async function getSessionInfo(
  sessionId: string | undefined
): Promise<SessionInfo> {
  if (!sessionId || !stripe) {
    return { amount: null, donorName: null, donorMessage: null };
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const amount =
      typeof session.amount_total === "number"
        ? formatUsd(session.amount_total)
        : null;
    const rawName = session.metadata?.donor_name;
    const donorName =
      typeof rawName === "string" && rawName.trim().length > 0
        ? rawName
        : null;
    const rawNote = session.metadata?.donor_message;
    const donorMessage =
      typeof rawNote === "string" && rawNote.trim().length > 0
        ? rawNote
        : null;
    return { amount, donorName, donorMessage };
  } catch {
    return { amount: null, donorName: null, donorMessage: null };
  }
}

export default async function TipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const { amount, donorName, donorMessage } = await getSessionInfo(session_id);

  return (
    <div>
      <section className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-16 text-center">
        <div className="bg-surface border border-border p-10 md:p-14 relative">
          {/* Cat-eye corner ornaments */}
          <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye" />
          <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye" />
          <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye" />
          <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye" />

          <p className="eyebrow mb-6 fade-up stagger-1">
            {donorName ? `Thank you, ${donorName}` : "Thank you"}
          </p>
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

          {donorMessage && (
            <div className="mt-8 max-w-md mx-auto fade-up stagger-5">
              <p className="eyebrow mb-3">Your note</p>
              <blockquote
                className="font-display italic text-ink leading-snug border-l-2 border-eye pl-5 py-1 text-left"
                style={{ fontSize: "1.05rem", fontWeight: 400 }}
              >
                {donorMessage}
              </blockquote>
            </div>
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
