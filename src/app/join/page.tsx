import Link from "next/link";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import { SubscriberCount } from "@/components/SubscriberCount";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join",
  description:
    "Get Stop Being Prey in your inbox. Reader-supported. Algorithms don't deliver this writing.",
};

export default function JoinPage() {
  return (
    <div>
      {/* === Masthead === */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-20 md:pt-28 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Stay close</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6.5vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Join the list.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Original writing on politics, power, and the apex class.
            Algorithms don&apos;t deliver this writing. It only arrives
            if you ask.
          </p>
        </div>
      </section>

      {/* === Email form === */}
      <section className="max-w-2xl mx-auto px-6 py-16 text-center">
        <SubscriberCount className="mb-5" />
        <div className="flex justify-center mb-6">
          <EmailSignup />
        </div>
        <p className="text-xs italic text-ink-faint">
          Unsubscribe anytime. We never share your email.
        </p>
      </section>

      <EyeDivider />

      {/* === While you decide === */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="bg-surface border border-ink/10 p-8 md:p-10 relative max-w-2xl mx-auto">
          <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-eye" />
          <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-eye" />
          <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-eye" />
          <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-eye" />

          <p className="eyebrow mb-4">If you&apos;re still deciding</p>
          <h2
            className="font-display tracking-tight mb-4 leading-[1.05]"
            style={{
              fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            <Link
              href="/the-losertarian-problem"
              className="text-ink hover:text-eye-deep transition-colors no-underline"
            >
              Start with The Losertarian Problem.
            </Link>
          </h2>
          <p className="deck mb-6 max-w-xl">
            Twenty years inside libertarianism, the moment it broke, and what
            to do next. The piece readers keep saying named what they&apos;d
            been feeling for years.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/the-losertarian-problem" className="btn-primary">
              <span>Read the essay</span>
            </Link>
            <Link href="/podcast" className="btn-secondary">
              Listen on the podcast
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
