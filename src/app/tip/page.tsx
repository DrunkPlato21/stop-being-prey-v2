import Link from "next/link";
import { TabbedTipCard } from "@/components/TabbedTipCard";
import { EyeDivider } from "@/components/Eyes";
import { listVisible } from "@/lib/supporters";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tip",
  description:
    "Stop Being Prey runs on reader contributions. Tip via card or Bitcoin Lightning Network.",
};

// Refresh the inline supporters block periodically without re-querying
// Redis on every visit. Page is light otherwise so this is safe.
export const revalidate = 60;

const LIGHTNING_ADDRESS = "stopbeingprey@walletofsatoshi.com";
const ANONYMOUS_LABEL = "a reader writes";

const trustLines: string[] = [
  "tips go directly to me. they support the writing, the podcast, and the time the project takes.",
  "not tax-deductible. this isn't a charity. it's a tip jar.",
  "tipping is gratitude. if you want, you can leave a public message on the supporters wall. that's the perk. nothing else is gated.",
];

export default async function TipPage() {
  // Pull a small window of recent supporters and filter to the named
  // ones. The inline block only ships if at least 3 named entries exist
  // (otherwise it would read as social proof of nothing).
  const recent = await listVisible(1, 30).catch(() => ({
    entries: [],
    total: 0,
  }));
  const namedRecent = recent.entries
    .filter((e) => e.attribution !== ANONYMOUS_LABEL)
    .slice(0, 3);
  const showInlineSupporters = namedRecent.length >= 3;

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

      {/* Tip card + trust wing. Tabbed donation card sits on the left
          on md+ with a Clay portrait + intimate trust copy on the right.
          On mobile the trust wing stacks below the card. */}
      <section className="max-w-5xl mx-auto px-6 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-start">
          <div className="md:col-span-7">
            <TabbedTipCard lightningAddress={LIGHTNING_ADDRESS} />
          </div>
          <aside className="md:col-span-5">
            <div className="flex flex-col items-center md:items-start gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/clay-portrait.jpg"
                alt="Clay"
                width={180}
                height={180}
                className="border border-border block"
                style={{
                  width: "180px",
                  height: "180px",
                  objectFit: "cover",
                }}
              />
              <div className="text-center md:text-left max-w-xs space-y-5">
                {trustLines.map((line, i) => (
                  <p
                    key={i}
                    className="font-serif italic text-ink-muted leading-relaxed"
                    style={{ fontSize: "0.95rem" }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {/* Recent supporters inline block. Conditional, only renders
            when there are at least 3 named entries on the wall. */}
        {showInlineSupporters && (
          <div className="mt-16 max-w-3xl mx-auto">
            <p className="eyebrow text-center mb-6">Recent supporters</p>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              {namedRecent.map((entry) => (
                <li
                  key={entry.id}
                  className="border-l-2 border-eye pl-5 py-1"
                >
                  <blockquote
                    className="font-display italic text-ink leading-snug mb-3"
                    style={{ fontSize: "1rem", fontWeight: 400 }}
                  >
                    {entry.message}
                  </blockquote>
                  <p
                    className="eyebrow"
                    style={{ letterSpacing: "0.22em", fontSize: "0.62rem" }}
                  >
                    {entry.attribution}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-8 text-center">
              <Link
                href="/supporters"
                className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                style={{ fontWeight: 500 }}
              >
                see the full wall →
              </Link>
            </div>
          </div>
        )}

        {!showInlineSupporters && (
          <div className="mt-10 text-center">
            <Link
              href="/supporters"
              className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
              style={{ fontWeight: 500 }}
            >
              see the supporters wall →
            </Link>
          </div>
        )}

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
