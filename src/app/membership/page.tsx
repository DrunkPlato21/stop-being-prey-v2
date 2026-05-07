import Link from "next/link";
import { MembershipPlans } from "@/components/MembershipPlans";
import { EyeDivider } from "@/components/Eyes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Membership",
  description:
    "Inside Stop Being Prey. Field Notes archive, early access to issues, off-platform commentary. Recurring membership.",
};

type Benefit = {
  eyebrow: string;
  body: string;
};

const BENEFITS: Benefit[] = [
  {
    eyebrow: "The Field Notes archive",
    body: "Annotated breakdowns of real engagements. Screenshots, post links, doctrine tags. The footwork behind the public writing.",
  },
  {
    eyebrow: "Early access",
    body: "Every issue lands in members' inboxes 24 to 48 hours before it goes public. First to read. First to act on it.",
  },
  {
    eyebrow: "Off-platform commentary",
    body: "What the algorithms throttle. Direct, members only.",
  },
  {
    eyebrow: "Member badge",
    body: "A members-only mark next to your name on the supporters wall. Visible to the rest.",
  },
];

export default function MembershipLandingPage() {
  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">For readers who want more</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Inside the work.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            The Field Notes archive. Early access to every issue.
            Off-platform commentary on what won&apos;t make it past the
            algorithms. The work, with the back room visible.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <ul className="space-y-10">
          {BENEFITS.map((b) => (
            <li key={b.eyebrow}>
              <p className="eyebrow mb-3">{b.eyebrow}</p>
              <p
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.05rem" }}
              >
                {b.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <EyeDivider />

      {/* Pricing + CTA */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center mb-10">
          <p className="eyebrow mb-3">Membership</p>
          <h2
            className="font-display text-ink leading-tight tracking-tight"
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Choose a cadence.
          </h2>
        </div>

        <MembershipPlans />

        <p className="text-center mt-10">
          <Link
            href="/notes/sign-in"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            already a member? sign in →
          </Link>
        </p>
      </section>

      <div className="text-center pb-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back home
        </Link>
      </div>
    </div>
  );
}
