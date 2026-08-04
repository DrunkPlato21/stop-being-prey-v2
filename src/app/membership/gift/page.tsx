import Link from "next/link";
import type { Metadata } from "next";
import { GiftForm } from "@/components/GiftForm";
import { EyeDivider } from "@/components/Eyes";

// Gift a seat to someone you KNOW: a named, personal pay-it-forward. One
// charge, a fixed term, a redemption email with your name on it. The
// anonymous side (cover a seat for a stranger, chip in toward the pool)
// lives on its own page, /membership/cover — these are two different
// acts and no longer share one screen. COPY IS PLACEHOLDER — Clay
// finalizes in his voice. Framing is pay-it-forward, never "gift card".

export const metadata: Metadata = {
  title: "Give someone a seat",
  description:
    "Pay it forward. Buy a seat inside Stop Being Prey for someone who needs to be in the room. One charge, no recurring billing.",
};

export const dynamic = "force-dynamic";

export default function GiftPage() {
  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Pay it forward</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Put someone in the room.
          </h1>
          <div className="max-w-xl mx-auto text-left fade-up stagger-3 space-y-5">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              You know someone who needs this. The friend who keeps losing
              arguments they should win. The one who feels the game being
              played on them but can&apos;t name the moves yet.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Buy them a seat. One charge, a fixed term, full membership.
              The comments, the Writer&apos;s Desk, the lounge, the Case
              Files, all of it. No card asked of them, nothing recurring
              on yours.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              That friend who can&apos;t name the moves yet? A season in
              the room and they start naming them. That&apos;s what
              you&apos;re really giving. Not a login. Sight.
            </p>
          </div>
        </div>
      </section>

      {/* Form — the named gift, and only that */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center mb-10">
          <p className="eyebrow mb-3">The seat</p>
          <h2
            className="font-display text-ink leading-tight tracking-tight"
            style={{
              fontSize: "clamp(1.8rem, 3.5vw, 2.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Name them, and they&apos;re in.
          </h2>
        </div>
        <GiftForm />
      </section>

      {/* Cross-link to the anonymous side */}
      <section className="max-w-md mx-auto px-6 pb-14">
        <div className="border-t border-rule pt-8 text-center">
          <p
            className="font-serif text-ink-muted leading-relaxed mb-3"
            style={{ fontSize: "0.98rem" }}
          >
            No one specific in mind?
          </p>
          <Link
            href="/membership/cover"
            className="group inline-flex items-center gap-1.5 no-underline"
          >
            <span
              className="font-display text-ink group-hover:text-eye-deep transition-colors"
              style={{ fontSize: "1.05rem", fontWeight: 600 }}
            >
              Cover a seat for a reader who can&apos;t afford one
            </span>
            <span
              className="text-eye-deep transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              &rarr;
            </span>
          </Link>
        </div>
      </section>

      <EyeDivider />

      {/* How it works */}
      <section className="max-w-xl mx-auto px-6 py-14 md:py-16">
        <p className="eyebrow mb-6 text-center">How it works</p>
        <ol className="space-y-5">
          {[
            "You pay once and write a short note if you want.",
            "They get an email with your name on it and a link to claim the seat.",
            "One click and they're inside. Full membership for the term, nothing asked of them.",
            "When the term nears its end, they choose whether to keep their seat on their own terms.",
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
        <p
          className="font-serif italic text-ink-muted leading-relaxed mt-8"
          style={{ fontSize: "0.92rem" }}
        >
          If they already have a seat, the gift isn&apos;t wasted: a
          gifted member gets their term extended, and a paying member can
          pass the seat on to someone else. You&apos;ll hear about it
          either way.
        </p>
      </section>

      <div className="text-center pb-16">
        <Link
          href="/membership?src=gift"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to membership
        </Link>
      </div>
    </div>
  );
}
