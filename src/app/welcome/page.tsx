import Link from "next/link";
import { EyeDivider } from "@/components/Eyes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome",
  description:
    "You're on the list. Stop Being Prey goes out to inboxes that asked for it. Reader-supported.",
};

export default function WelcomePage() {
  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Welcome</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            You&apos;re in.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Check your inbox for the welcome email. Then we begin.
          </p>
        </div>
      </section>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="prose-article">
          <p>
            Thank you for joining the list. Stop Being Prey lands in your
            inbox a few times a week. Reader-supported.
          </p>

          <p>
            While you wait for the first letter, here&apos;s where to start.
          </p>
        </div>
      </div>

      {/* Featured essay card */}
      <div className="max-w-3xl mx-auto px-6 pb-12">
        <div className="bg-surface border border-ink/10 p-8 md:p-10 relative">
          {/* Cat-eye corner ornaments */}
          <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-eye" />
          <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-eye" />
          <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-eye" />
          <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-eye" />

          <p className="eyebrow mb-4">Start here</p>

          <h2
            className="font-display tracking-tight mb-5 leading-[1.05]"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            <Link
              href="/the-losertarian-problem"
              className="text-ink hover:text-eye-deep transition-colors no-underline"
            >
              The Losertarian Problem
            </Link>
          </h2>

          <p className="deck mb-8">
            The largest piece I&apos;ve written. Twenty years inside
            libertarianism, the moment it broke, and what to do next.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/the-losertarian-problem" className="btn-primary">
              <span>Read the essay</span>
            </Link>
            <a
              href="https://open.spotify.com/show/6Pjbl5jXQlOoHpVn696V1t"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              Listen on Spotify
            </a>
          </div>
        </div>
      </div>

      <EyeDivider />

      {/* Sign-off */}
      <section className="max-w-2xl mx-auto px-6 py-12 text-center">
        <p
          className="font-display italic text-ink leading-relaxed"
          style={{ fontSize: "1.5rem", fontWeight: 400 }}
        >
          stay close.
        </p>
        <p
          className="font-display italic text-ink leading-relaxed mt-4"
          style={{ fontSize: "1.15rem", fontWeight: 400 }}
        >
          ~ Clay
        </p>
      </section>
    </div>
  );
}
