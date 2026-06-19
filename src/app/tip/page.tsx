import Link from "next/link";
import Image from "next/image";
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
  "tips go straight to me. they pay for the writing, the audio, and the hours this takes.",
  "but really, they buy one thing: independence.",
  "no ads. no sponsors. no donor class. nobody i have to keep happy, and nothing i can't say. when readers fund the work, the work answers to readers. that's the whole point.",
  "if you tip, you can leave your name and a note on the supporters wall. that's the only perk. it's just gratitude, going both ways.",
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

      {/* Tip card section. Recent supporters sit above the card as
          ambient social proof leading into the ask; the donation card
          + trust wing sit below; the wall link tails the section.
          On mobile everything stacks; on md+ the card and trust wing
          form a 12-col grid. */}
      <section className="max-w-5xl mx-auto px-6 pt-12 md:pt-16 pb-16 md:pb-20">
        {/* Recent supporters — moved above the card to act as the
            social proof that precedes the ask. Conditional: only
            renders when there are at least 3 named entries. On
            mobile we show one quote to keep the card close to the
            fold; the rest unfold at md+. */}
        {showInlineSupporters && (
          <div className="mb-12 md:mb-16 max-w-3xl mx-auto">
            <p className="eyebrow text-center mb-5 md:mb-6">
              Recent supporters
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
              {namedRecent.map((entry, i) => (
                <li
                  key={entry.id}
                  className={`border-l-2 border-eye pl-5 py-1${
                    i > 0 ? " hidden md:block" : ""
                  }`}
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
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-12 items-start">
          <div className="md:col-span-7">
            <TabbedTipCard lightningAddress={LIGHTNING_ADDRESS} />
          </div>
          <aside className="md:col-span-5">
            <div className="flex flex-col items-center md:items-start gap-6">
              <Image
                src="/images/clay-winter.jpg"
                alt="Clay, founder of Stop Being Prey"
                width={400}
                height={500}
                sizes="(min-width: 768px) 200px, 200px"
                className="border border-border block"
                style={{
                  width: "200px",
                  height: "250px",
                  objectFit: "cover",
                  objectPosition: "center top",
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

        {/* Wall link tails the section. Copy shifts based on whether
            inline supporters showed above the card. */}
        <div className="mt-12 text-center">
          <Link
            href="/supporters"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            {showInlineSupporters
              ? "see the full wall →"
              : "see the supporters wall →"}
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
