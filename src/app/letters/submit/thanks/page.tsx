import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Letter Received",
  description:
    "Thank you for submitting a letter to the Preditor. I read every one.",
};

export default function LetterThanksPage() {
  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Editorial</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Letter Received
          </h1>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="prose-article">
          <p>
            Thank you. I read every letter that comes in. If yours runs in
            the next edition of Letters to the Preditor, I&apos;ll send you
            the proof first.
          </p>
          <p>
            In the meantime, the{" "}
            <Link href="/">latest essay</Link> is here, the{" "}
            <Link href="/podcast">podcast</Link> is here, and the{" "}
            <Link href="/#join">daily letter</Link> goes out in the morning.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
