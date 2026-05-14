import Link from "next/link";
import { MembershipPlans } from "@/components/MembershipPlans";
import { EyeDivider } from "@/components/Eyes";
import { DeskPresenceIndicator } from "@/components/DeskPresenceIndicator";
import { FOUNDER_CAP, getFounderClaimed } from "@/lib/members";
import { derivePresenceState, getPresence } from "@/lib/desk";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Membership",
  description:
    "Inside Stop Being Prey. Commenting access, the Field Notes archive, early access to issues, first in line for the book. Founder rate locked for life on the first 100.",
};

// Counter is rendered fresh on each request (no caching) so the
// "spots remaining" number is honest in tight moments. Membership
// traffic is light enough that this is fine.
export const dynamic = "force-dynamic";

type Benefit = {
  eyebrow: string;
  /** Each entry renders as its own paragraph with paragraph spacing.
      The Writer's Desk beat carries two paragraphs; all others a
      single string in the array. */
  body: string[];
};

const BENEFITS: Benefit[] = [
  {
    eyebrow: "the Writer's Desk",
    body: [
      "You log in, you see if I'm at the desk. A green light pulses next to my name while I'm working. When I step away, you know that too. You see what I'm thinking, what I'm working on, what I'm reading. You can leave a note any time. I see it. I might react. I might answer in public.",
      "It's not a feature. It's the heartbeat. You're connected directly to me while I work.",
    ],
  },
  {
    eyebrow: "the comment section",
    body: [
      "The thread under every piece is members only. No free comments. The signal stays strong because everyone in the room paid to be in it.",
    ],
  },
  {
    eyebrow: "rules of engagement",
    body: [
      "Eight rules. The doctrine of the operator class. The framework that turns losing arguments into public demonstrations.",
    ],
  },
  {
    eyebrow: "Case Files",
    body: [
      "Where the Rules come alive. Real comment-section battles dissected, with the actual lines you can deploy when it happens to you. You can submit your own.",
    ],
  },
  {
    eyebrow: "Field Notes",
    body: [
      "The director's commentary on my work. The back story. The moves I made in real time that didn't make it into the essays. Annotated breakdowns of real engagements plus the off-platform writing the algorithms throttle.",
    ],
  },
  {
    eyebrow: "the Lounge",
    body: [
      "Where the operators talk when I'm not at the desk. The room you walk into when you want to be among people who think like you.",
    ],
  },
  {
    eyebrow: "the Book",
    body: [
      "Stop Being Prey, written in front of you. Drafts and updates as the manuscript takes shape. When the book lands, members get it before retail.",
    ],
  },
];

type ReaderQuote = {
  body: string;
  attribution: string;
};

// Real reader testimonials surfaced between the feature beats and the
// pricing block. Each is verbatim from the email/comment trail; do
// not invent or paraphrase.
const READER_QUOTES: ReaderQuote[] = [
  {
    body: "The losertarian piece, the personal arc you drew, really hit me... I like what you're doing, I like the way you think, and I want to join up.",
    attribution: "Adam, founder",
  },
  {
    body: "I'm skeptical by nature but I have to tell you, this one got me. I'm in for the long haul with you Clay.",
    attribution: "Sandy, founder",
  },
  {
    body: "By equipping us with the intellectual ammunition necessary to influence our local communities, you are helping us secure the small victories required to eventually shift the national tide.",
    attribution: "Mike, UK reader",
  },
  {
    body: "I've been a registered Libertarian since the party was founded. Your ideas and writings are profound and realistic. I'd like to become a part-time predator.",
    attribution: "Reader email",
  },
];

type FAQEntry = {
  q: string;
  a: string;
};

const FAQ: FAQEntry[] = [
  {
    q: "what does membership get me?",
    a: "commenting access on every piece, the Field Notes archive, 24 to 48 hours of early access on new issues and walls, and the manuscript when the book lands.",
  },
  {
    q: "why $8 for the first hundred?",
    a: "the first hundred are my inner circle. the people who say yes before everyone else. they lock $8 a month for as long as they stay subscribed, and they carry a founder badge with their number for as long as they're here. it's not a discount. it's recognition for being first. after that, the floor moves to $13. pay what you want above either.",
  },
  {
    q: "can i cancel anytime?",
    a: "yes. cancel from your account; you keep access through the end of your billing period.",
  },
  {
    q: "what's a fair amount?",
    a: "whatever you'd pay the writer who actually changed how you think. the floor exists for sustainability. the slider exists for the readers who want to pay more.",
  },
];

export default async function MembershipLandingPage() {
  const [founderClaimed, presence] = await Promise.all([
    getFounderClaimed(),
    getPresence(),
  ]);
  const founderEligible = founderClaimed < FOUNDER_CAP;
  const remaining = Math.max(0, FOUNDER_CAP - founderClaimed);
  // Live presence on the sales page: the Writer's Desk beat carries
  // a pulsing pill that reflects Clay's actual current state, so the
  // abstract promise ("a green light pulses next to my name") is
  // concrete. Rendered via DeskPresenceIndicator so the pill polls
  // every 30s — visitors who linger don't have to refresh to see Clay
  // flip presence in real time.
  const presenceState = derivePresenceState(presence);

  return (
    <div>
      {/* Cold-open — opens the page with a reader anecdote that
          demonstrates the framework landing inside a real decision.
          No header, no label, no decoration — prose lands first.
          Nested the same way as the "In the room with me." doctrine block
          below (max-w-3xl outer + max-w-xl inner) so the left edges
          of both blocks line up exactly. Serif body slightly larger
          than standard (~1.18rem) with generous line-height (1.62).
          No italics this version. */}
      <section>
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-20 md:pb-24">
          <div
            className="max-w-2xl mx-auto font-serif text-ink space-y-5 fade-up stagger-1"
            style={{ fontSize: "1.18rem", lineHeight: 1.62 }}
          >
            <p>
              A reader emailed me last month. He&apos;s a consultant. His
              firm had just proposed a &ldquo;race-aware session&rdquo; at
              a board meeting. He was sitting there with the decision on
              the table and had to respond on the spot.
            </p>
            <p>
              He wrote a rebuttal in the chat using what he&apos;d learned
              from my work. He pre-empted the pushback he knew was coming.
              He sent me the whole exchange afterward and asked: &ldquo;How
              did I do?&rdquo;
            </p>
            <p>He did it right. The framing went into the room.</p>
          </div>
        </div>
      </section>

      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            For readers who want more
          </p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-10 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            In the room with me.
          </h1>
          {/* Leader / doctrine block. Body serif left-aligned inside
              the centered masthead column so multi-paragraph prose
              reads naturally; centered prose at this length fights
              the reader. */}
          <div className="max-w-xl mx-auto text-left fade-up stagger-3 space-y-5">
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              For ten years I&apos;ve run the largest Thomas Sowell quotes
              page on Facebook. I built ReadSowell.com, a quotes database
              with proper sourcing, no misattributions, every quote linked
              to its source. I&apos;m a software engineer by trade.
              I&apos;m becoming a writer out of necessity. That&apos;s a
              skill stack Scott Adams would call rare.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              Two months ago I went full time on the writing. You readers
              were a big part of that decision... the responses to my work
              have been overwhelming. You&apos;re practically begging me
              to write full time. You&apos;ve even sent me tips! Real
              money! Okay I guess we have something real here...
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              This membership is the foundation that makes it sustainable.
              Not sporadic... Structural. Your support is what keeps me at
              the desk. If I can get enough of you on board, I can dedicate
              100% of my time to writing and not worry about anything else.
              That&apos;s the goal.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              What do you get in return? A direct connection to me and
              everything I&apos;m working on.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              What I&apos;m offering isn&apos;t a content library...
              it&apos;s access to watch the doctrine form in real time.
              You&apos;ll see drafts. You&apos;ll see the moves I&apos;m
              making as I make them. You&apos;ll see the framework take
              shape while it&apos;s happening, not after. Few writers offer
              this. Almost none.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              I never thought my work would carry this kind of weight...
              but it is. The way readers are writing to me lately, it&apos;s
              starting to become clear. I&apos;ve figured something out
              that needs to get out. People are starting to see me as
              someone who sees things clearly... I fear they might be
              right...
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              I feel the burden of that too. I&apos;m not sure I&apos;ve
              earned it yet. I&apos;ll work to earn it.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              This project exists because I&apos;m asking readers
              who&apos;ve been with me on Facebook, on the email list, in
              the comments, to step closer. To put real money on the table
              so I can keep building. In return, I owe you everything I
              have.
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.08rem" }}
            >
              I&apos;ll be at the desk every day. That&apos;s the contract.
            </p>
          </div>
        </div>
      </section>

      {/* Founder counter strip */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 py-8 md:py-10 text-center">
          {founderEligible ? (
            <>
              <p
                className="font-display text-ink leading-none mb-3"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {founderClaimed} of {FOUNDER_CAP} founder spots claimed
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.98rem" }}
              >
                $8/mo locked for life. {remaining}{" "}
                {remaining === 1 ? "slot" : "slots"} left.
              </p>
              {/* CTA — smooth-scrolls to the pricing block so the
                  scarcity beat converts in place instead of pushing
                  the reader through six feature beats first. */}
              <p className="mt-6">
                <Link
                  href="#pricing"
                  className="font-display uppercase tracking-[0.24em] text-eye-deep hover:text-ink no-underline transition-colors"
                  style={{ fontSize: "0.75rem", fontWeight: 600 }}
                >
                  Claim your slot &rarr;
                </Link>
              </p>
            </>
          ) : (
            <>
              <p
                className="font-display text-ink leading-none mb-3"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                founder spots filled
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.98rem" }}
              >
                regular tier opens at $13/mo.
              </p>
              <p className="mt-6">
                <Link
                  href="#pricing"
                  className="font-display uppercase tracking-[0.24em] text-eye-deep hover:text-ink no-underline transition-colors"
                  style={{ fontSize: "0.75rem", fontWeight: 600 }}
                >
                  Subscribe &rarr;
                </Link>
              </p>
            </>
          )}
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <ul className="space-y-12">
          {BENEFITS.map((b) => {
            // Writer's Desk gets two subtle anchoring moves: a short
            // olive accent rule above the eyebrow, and a slightly
            // larger eyebrow size. Plus the live-presence demo pill
            // below — same vocabulary as the chrome indicator. None
            // of these alone shouts "featured block"; together they
            // signal "this is the heart" without breaking the
            // sibling rhythm of the other beats.
            const isDesk = b.eyebrow === "the Writer's Desk";
            return (
              <li
                key={b.eyebrow}
                style={
                  isDesk
                    ? { paddingTop: "0.75rem", paddingBottom: "0.5rem" }
                    : undefined
                }
              >
                {isDesk && (
                  <span
                    aria-hidden="true"
                    className="block mb-5"
                    style={{
                      width: "2.5rem",
                      height: "2px",
                      background: "var(--eye-deep)",
                    }}
                  />
                )}
                <p
                  className="eyebrow mb-3"
                  style={
                    isDesk
                      ? {
                          fontSize: "0.82rem",
                          letterSpacing: "0.34em",
                        }
                      : undefined
                  }
                >
                  {b.eyebrow}
                </p>
                {isDesk && (
                  <div className="desk-presence-demo mb-5">
                    <DeskPresenceIndicator
                      initialState={presenceState}
                      href="/desk"
                    />
                  </div>
                )}
                <div className="space-y-4">
                  {b.body.map((para, i) => (
                    <p
                      key={i}
                      className="font-serif text-ink leading-relaxed"
                      style={{ fontSize: "1.05rem" }}
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <EyeDivider />

      {/* Reader proof — verbatim testimonials between the feature
          beats and the pricing block. Italic serif body with non-
          italic em-dash attribution beneath. Renders only when the
          array has entries so dev environments without testimonials
          don't ship a "From readers inside" stub. */}
      {READER_QUOTES.length > 0 && (
        <>
          <section className="max-w-3xl mx-auto px-6 py-5 md:py-8">
            <div className="text-center mb-6">
              <p className="eyebrow">What readers have been writing</p>
            </div>
            <ul className="space-y-8">
              {READER_QUOTES.map((quote) => (
                <li key={quote.attribution}>
                  <blockquote
                    className="font-serif italic text-ink leading-relaxed mb-3"
                    style={{ fontSize: "1.15rem" }}
                  >
                    &ldquo;{quote.body}&rdquo;
                  </blockquote>
                  <p
                    className="font-serif text-ink-muted"
                    style={{ fontSize: "0.92rem" }}
                  >
                    &mdash; {quote.attribution}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <EyeDivider />
        </>
      )}

      {/* Pricing + CTA */}
      <section
        id="pricing"
        className="max-w-3xl mx-auto px-6 py-14 md:py-20"
        style={{ scrollMarginTop: "2rem" }}
      >
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
            Set your rate.
          </h2>
        </div>

        <MembershipPlans
          founderEligible={founderEligible}
          founderClaimed={founderClaimed}
        />

        <p className="text-center mt-10">
          <Link
            href="/notes/sign-in"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            already a member? sign in &rarr;
          </Link>
        </p>

        {/* P.S. — closing beat. Left-aligned to match the rest of the
            page body; centered prose at this length fights the reader.
            Generous top margin so it sits as a separate emotional
            landing rather than another row of the pricing block. The
            four-word reply renders as an indented italic line so it
            reads as a quote inside the prose. */}
        <div className="max-w-xl mx-auto mt-20 space-y-5">
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1rem" }}
          >
            P.S. A reader replied to the losertarian piece the day it
            shipped. His whole reply was four words.
          </p>
          <p
            className="font-serif italic text-ink leading-relaxed pl-6 border-l-2 border-eye"
            style={{ fontSize: "1.05rem" }}
          >
            &ldquo;Thank you for this. Just...thank you.&rdquo;
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1rem" }}
          >
            I don&apos;t know what the piece did for him. He just felt he
            had to say it. The work means something. I want to keep
            earning that.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1rem" }}
          >
            If you haven&apos;t read the founding piece yet, read it first.
            The Charlie Kirk essay is where the doctrine landed in its
            sharpest form.{" "}
            <Link
              href="/founding/charlie-kirk"
              className="text-eye-deep hover:text-ink no-underline transition-colors"
              style={{ fontWeight: 500 }}
            >
              Read the founding piece &rarr;
            </Link>
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1rem" }}
          >
            If you&apos;ve felt it too, the door is here.
          </p>
        </div>
      </section>

      <EyeDivider />

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center mb-10">
          <p className="eyebrow">Questions</p>
        </div>
        <dl className="space-y-9">
          {FAQ.map((entry) => (
            <div key={entry.q} className="border-l-2 border-rule pl-6">
              <dt
                className="font-display text-ink mb-2"
                style={{ fontSize: "1.2rem", fontWeight: 600 }}
              >
                {entry.q}
              </dt>
              <dd
                className="font-serif text-ink-muted leading-relaxed"
                style={{ fontSize: "1rem" }}
              >
                {entry.a}
              </dd>
            </div>
          ))}
        </dl>
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
