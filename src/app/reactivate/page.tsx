import Link from "next/link";
import type { Metadata } from "next";
import { ReactivateForm } from "@/components/ReactivateForm";

// Self-serve reactivation for a lapsed member (card expired / payment
// failed / subscription canceled). Enter email → Stripe Checkout to add a
// new card → back in at the locked rate with founder standing intact.
// Replaces hand-building subscriptions in the Stripe dashboard. COPY IS
// DRAFT — Clay finalizes.

export const metadata: Metadata = {
  title: "Reactivate your seat",
  description:
    "Your card lapsed? Add a new one and come back at your locked rate, founder standing and all.",
};

export const dynamic = "force-dynamic";

export default function ReactivatePage() {
  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Come back</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Reactivate your seat.
          </h1>
          <div className="max-w-xl mx-auto text-left fade-up stagger-3 space-y-5">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              A card expires, a charge fails, and the seat lapses. It
              happens. Nothing about your standing changed while you were
              gone.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Add a new card below and you&apos;re back in, at the exact
              rate you locked in. If you were a founder, you&apos;re still a
              founder, same number, same price. It renews on its own from
              here, no invoices to chase.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <ReactivateForm />
      </section>

      <div className="text-center pb-16">
        <Link
          href="/patronage"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to patronage
        </Link>
      </div>
    </div>
  );
}
