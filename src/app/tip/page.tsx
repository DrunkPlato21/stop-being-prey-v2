import Link from "next/link";
import { TabbedTipCard } from "@/components/TabbedTipCard";
import { EyeDivider } from "@/components/Eyes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tip",
  description:
    "Stop Being Prey runs on reader contributions. Tip via card or Bitcoin Lightning Network.",
};

const LIGHTNING_ADDRESS = "stopbeingprey@walletofsatoshi.com";

export default function TipPage() {
  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">If the work matters</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Support the work.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Stop Being Prey runs on reader contributions. If the writing
            means something to you, here&apos;s how to back it.
          </p>
        </div>
      </section>

      {/* Unified tip card. Tabs swap between Fiat (Stripe) and
          Lightning (LUD-16 + QR) panels inside one container. */}
      <section className="max-w-3xl mx-auto px-6 py-16 md:py-20">
        <TabbedTipCard lightningAddress={LIGHTNING_ADDRESS} />

        <div className="mt-8 text-center">
          <Link
            href="/supporters"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            see the supporters wall →
          </Link>
        </div>

        {/* On-chain coming soon */}
        <div className="mt-12 text-center max-w-2xl mx-auto">
          <p className="text-sm text-ink-muted italic leading-relaxed">
            On-chain Bitcoin support is coming via self-hosted BTCPay Server.
            Until then, Lightning is the cleanest way to send sats: unique
            invoice per payment, lowest fees, no third-party custody on the
            Stop Being Prey end.
          </p>
        </div>
      </section>

      <EyeDivider />

      {/* Closing note */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p
          className="font-display italic text-ink-muted leading-relaxed mb-10"
          style={{ fontSize: "1.3rem", fontWeight: 400 }}
        >
          Reader-supported. That&apos;s only possible because of you.
        </p>

        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← Back home
        </Link>
      </section>
    </div>
  );
}
