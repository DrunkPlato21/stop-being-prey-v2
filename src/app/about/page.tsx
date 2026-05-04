import Link from "next/link";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import { AuthorBio } from "@/components/AuthorBio";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Stop Being Prey. About Clay. Recovering libertarian. Host of the largest Thomas Sowell page on Facebook.",
};

export default function AboutPage() {
  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">A note from Clay</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            What this is.
          </h1>
          <p className="font-serif italic text-ink-muted text-lg md:text-xl max-w-xl mx-auto leading-relaxed fade-up stagger-3">
            Recovering libertarian, writing the playbook.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 pt-12">
        <AuthorBio />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="prose-article">
          <p>
            Stop Being Prey is the home of original writing that reads politics
            and power through a predator-prey lens.
          </p>

          <p>
            I run the largest{" "}
            <a
              href="https://facebook.com/thomassowellquotes"
              target="_blank"
              rel="noopener noreferrer"
            >
              Thomas Sowell quotes page
            </a>{" "}
            on Facebook. 188,000+ followers, 18 million+ monthly impressions. I
            built{" "}
            <a
              href="https://readsowell.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              ReadSowell.com
            </a>
            , the ultimate resource for Thomas Sowell readers. Every quote
            verified and linked back to its original source.
          </p>

          <p>
            I&apos;m a recovering libertarian, twenty years inside the movement,
            who came out the other side with a different read on what power
            actually is and how it&apos;s wielded.
          </p>

          <p>
            The daily letter goes out every morning. Free. No ads, no sponsors,
            never gated.{" "}
            <Link href="/tip">Reader-supported</Link>.
          </p>

          <p>
            Future material will sit behind a paywall... book chapters,
            deep-dive essays, member-only material, a Discord server. The
            daily letter is the exception. Free, every day, forever.
            That&apos;s the promise.
          </p>

          <p>
            Stop Being Prey is also a book in progress, and a podcast where I
            read each essay aloud.
          </p>

          <h2>The work</h2>

          <p>
            Long-form essays on politics, power, and the apex political class.
            Realpolitik analysis with no ideological flinching. Occasional
            pieces on history, economics, strategy, and the question of what it
            actually takes to win in the environment we&apos;re in.
          </p>

          <h2>The voice</h2>

          <p>
            Direct. Unapologetic. Right-wing realpolitik. Voice-driven daily
            letters in the lineage of Sowell himself: clear, direct,
            indifferent to fashion. Politics and power, written for people who
            need to act on what they read.
          </p>

          <h2>What I&apos;m building</h2>

          <p>
            The goal is bigger than a daily letter. Stop Being Prey is, for
            the right, what Saul Alinsky&apos;s <em>Rules for Radicals</em>{" "}
            was for the left: a tactical playbook that lasts a generation.
          </p>

          <p>
            Alinsky taught the left how to take institutions. The right has
            had no equivalent. That slot has been open since 1971.
          </p>

          <p>
            I&apos;m the answer to him. Sixty years late, but here.
          </p>

          <h2>Why I write</h2>

          <p>
            I am Canadian, writing to American readers because my country
            already lost the same fight you&apos;re in.
          </p>

          <p>
            The list grows fast. Open rates run high. The feedback has been
            the most intense of my life: readers becoming operators, leaving
            the prey frame behind, sending money, asking me to keep going.
          </p>

          <p>
            Nobody else is doing this for the right. That&apos;s what
            you&apos;ve been telling me. That&apos;s why I write.
          </p>
        </div>
      </div>

      <EyeDivider />

      <section className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="eyebrow mb-4">Get the daily letter</p>
        <h2
          className="font-display text-ink leading-tight tracking-tight mb-4"
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Every morning. Free.
        </h2>
        <p className="deck mb-8">No ads. No sponsors. No paywalls.</p>
        <div className="flex justify-center">
          <EmailSignup />
        </div>
      </section>

      <div className="text-center pb-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← Back home
        </Link>
      </div>
    </div>
  );
}
