import Link from "next/link";
import type { Metadata } from "next";
import { PoolClaimForm } from "@/components/PoolClaimForm";
import { PoolCounter } from "@/components/PoolCounter";
import { EyeDivider } from "@/components/Eyes";

// Receive side of the community seat pool. A quiet, private way in for
// someone who can't afford membership: email + one optional line, no
// proof, no justification. Readable signed-out (they have no account
// yet). COPY IS DRAFT — Clay finalizes. (The route slug is Clay's call.)

export const metadata: Metadata = {
  title: "Another way in",
  description:
    "Can't afford a seat right now? Readers fund seats for people who can't. Ask for one, privately.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PoolClaimPage() {
  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Another way in</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Can&apos;t afford it? Come in anyway.
          </h1>
          <div className="max-w-xl mx-auto text-left fade-up stagger-3 space-y-5">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Readers fund seats for people who can&apos;t swing the price
              right now. If that&apos;s you, take one. No proof, no
              questions, nobody deciding whether you qualify.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Someone covered you. When you&apos;re able, you&apos;ll cover
              the next person. That&apos;s the whole thing. A chain, and
              you&apos;re a link in it.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Private both ways: whoever funded your seat never learns who
              took it, and you never learn who they were.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <PoolClaimForm />
      </section>

      <EyeDivider />

      {/* How it works + live counter */}
      <section className="max-w-xl mx-auto px-6 py-14 md:py-16">
        <p className="eyebrow mb-6 text-center">How it works</p>
        <ol className="space-y-5 mb-10">
          {[
            "You ask for a seat with just your email. Leave a line if you want, or don't.",
            "We email you a one-tap link to confirm it's really you.",
            "If a seat is funded and free, you're in for the term, right then. If not, you hold the next one in line.",
            "When the next seat is funded, it goes to whoever's been waiting longest. No jumping the line, no asking twice.",
          ].map((step, i) => (
            <li key={i} className="flex gap-4">
              <span
                className="font-display text-eye-deep leading-none"
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              >
                {i + 1}.
              </span>
              <span
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.02rem" }}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>
        <PoolCounter />
      </section>

      <div className="text-center pb-16">
        <Link
          href="/membership"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to membership
        </Link>
      </div>
    </div>
  );
}
