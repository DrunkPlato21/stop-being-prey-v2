import Link from "next/link";
import type { Metadata } from "next";

// Landing page after a member finishes updating their card in the Stripe
// portal (the recovery flow's return_url). Public and static — they may
// not be signed in. Just a warm confirmation and a way home.

export const metadata: Metadata = {
  title: "You're all set",
  description: "Your card is updated.",
  robots: { index: false, follow: false },
};

export default function BillingUpdatedPage() {
  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">Membership</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          You&apos;re all set.
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">
          Your card&apos;s updated and your membership carries on
          uninterrupted. If a payment had failed, it&apos;ll retry on the new
          card automatically. Thank you for keeping the work going.
        </p>

        <Link
          href="/"
          className="text-eye-deep hover:text-ink"
          style={{
            fontSize: "0.95rem",
            textDecoration: "underline",
            textDecorationColor: "var(--eye)",
            textDecorationThickness: "1px",
            textUnderlineOffset: "3px",
          }}
        >
          Back to Stop Being Prey
        </Link>
      </section>
    </div>
  );
}
