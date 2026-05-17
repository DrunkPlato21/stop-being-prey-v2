import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

// /coin — "The Coin in My Pocket". Standalone essay-style page,
// public, no auth. Mirrors the site's editorial vocabulary
// (eyebrow + display title, prose-article reading column,
// eye-deep accents) and pivots a pull quote into the middle of
// the piece as the dominant visual beat between hero photo and
// the membership CTA at the foot.

const TITLE = "The Coin in My Pocket";
const DESCRIPTION =
  "A 1963 Canadian silver dollar, half an ounce of silver, and what it teaches you about the minimum wage and the collapse of the dollar.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/coin" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "article",
    authors: ["Clay"],
    url: "/coin",
    images: ["/images/coin-1963.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@stopbeingprey",
    images: ["/images/coin-1963.png"],
  },
};

export default function CoinPage() {
  return (
    <article>
      {/* === Masthead ============================================= */}
      <header className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-10 md:pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">A note from Clay</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            The Coin in My Pocket
          </h1>
        </div>
      </header>

      {/* === Hero photo ===========================================
           Sits at the prose column width so it lines up visually
           with the body type below. Portrait-orientation source
           (661×800), priority-loaded since it's the first
           above-the-fold beat. */}
      <div className="max-w-3xl mx-auto px-6 pt-10 md:pt-14">
        <figure
          className="mx-auto"
          style={{ maxWidth: "38rem" }}
        >
          <Image
            src="/images/coin-1963.png"
            alt="A 1963 Canadian silver dollar next to a modern Canadian loonie, both resting in a hand."
            width={661}
            height={800}
            priority
            sizes="(min-width: 640px) 38rem, 100vw"
            className="w-full h-auto block border border-border"
          />
        </figure>
      </div>

      {/* === Body, part 1 — setup and the two coins =============== */}
      <div className="max-w-3xl mx-auto px-6 pt-10 md:pt-14">
        <div className="prose-article">
          <p>
            <span className="lead-incipit">This is the coin</span> I carry
            around for moments when someone starts talking about the
            minimum wage.
          </p>
          <p>
            It&apos;s a 1963 Canadian silver dollar. Half an ounce of
            silver. A little tarnished. A little scratched. The kind of
            patina that comes from being in pockets and palms for decades.
            It still carries its weight.
          </p>
          <p>
            At today&apos;s silver prices, the metal in this coin is
            worth about $50 Canadian. The face value is one dollar.
            Believe it or not, it&apos;s still considered legal tender at
            $1.
          </p>
          <p>
            Next to it: a modern Canadian loonie. A dollar coin minted in
            the era of fiat money. Plated steel and brass. The metal
            value is less than a penny. The face value is one dollar.
          </p>
          <p>Two coins. Same face value. Different worlds.</p>
        </div>
      </div>

      {/* === Pull quote ===========================================
           Centered within the same container as the prose, but
           pumped up well past the default `.prose-article
           blockquote` treatment: thicker eye border, paper-deep
           tone behind, display-serif italic at ~1.85rem so it
           lands as the visual hinge of the piece. */}
      <div className="max-w-3xl mx-auto px-6">
        <figure
          className="mx-auto"
          style={{
            maxWidth: "38rem",
            margin: "2.5rem auto",
          }}
        >
          <blockquote
            className="font-display italic text-ink"
            style={{
              borderLeft: "3px solid var(--eye)",
              background: "var(--paper-deep)",
              padding: "1.5rem 1.5rem 1.5rem 1.75rem",
              fontSize: "clamp(1.4rem, 3.6vw, 1.85rem)",
              lineHeight: 1.35,
              fontWeight: 400,
              margin: 0,
            }}
          >
            Would you rather earn one dollar an hour in these, or fifteen
            dollars an hour in today&apos;s money?
          </blockquote>
        </figure>
      </div>

      {/* === Body, part 2 — the argument and the close ============ */}
      <div className="max-w-3xl mx-auto px-6 pb-10 md:pb-14">
        <div className="prose-article">
          <p>
            Hold the silver coin in your hand. Feel the weight. Then look
            at the loonie. The math does itself.
          </p>
          <p>
            A 1963 worker earning one dollar an hour in silver had more
            purchasing power than a 2025 worker earning fifteen in fiat.
          </p>
          <p>
            The minimum wage didn&apos;t fail to keep up with inflation.
            The dollar collapsed underneath it.
          </p>
          <p>
            That&apos;s the real story. And it&apos;s the story most
            conservatives never tell when they argue about the minimum
            wage.
          </p>

          <hr />

          {/* === Soft CTA ========================================
               Reads as invitation: a line of body copy with a
               single inline link in the eye-deep accent. No button
               chrome, no urgency framing beyond the founder-pricing
               line that's already part of Clay's copy. */}
          <p>
            If you want to learn how to dismantle progressive arguments
            like this one, my membership is where I teach it.
          </p>
          <p>
            The first 100 founders get in at $8/month locked for life.
            The price goes to $13 when the door closes. Just over half
            are gone.
          </p>
          <p>
            <Link
              href="/membership"
              className="text-eye-deep hover:text-ink no-underline transition-colors"
              style={{ fontWeight: 600 }}
            >
              Join here &rarr;
            </Link>
          </p>
          <p style={{ marginTop: "2.5rem" }}>~ Clay</p>
        </div>
      </div>

      {/* === Page footer ==========================================
           Quiet bottom rail. Matches the small-caps Cormorant link
           register used elsewhere ("← Back home" on /about). Two
           pointers: home and the email signup page. */}
      <footer className="border-t border-rule">
        <nav className="max-w-3xl mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center">
          <Link
            href="/"
            className="font-display text-ink-muted hover:text-eye-deep no-underline uppercase transition-colors"
            style={{
              letterSpacing: "0.18em",
              fontWeight: 500,
              fontSize: "0.78rem",
            }}
          >
            &larr; Back home
          </Link>
          <span className="text-ink-faint" aria-hidden="true">
            ·
          </span>
          <Link
            href="/join"
            className="font-display text-ink-muted hover:text-eye-deep no-underline uppercase transition-colors"
            style={{
              letterSpacing: "0.18em",
              fontWeight: 500,
              fontSize: "0.78rem",
            }}
          >
            Get the letter
          </Link>
        </nav>
      </footer>
    </article>
  );
}
