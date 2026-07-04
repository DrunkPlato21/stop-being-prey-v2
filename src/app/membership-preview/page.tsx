import Link from "next/link";
import { MembershipPlans } from "@/components/MembershipPlans";
import { StickyJoinBar } from "@/components/StickyJoinBar";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import { DeskPresenceIndicator } from "@/components/DeskPresenceIndicator";
import {
  CHARTER_CAP,
  FOUNDER_CAP,
  countAllMembers,
  getCharterClaimed,
  getFounderClaimed,
} from "@/lib/members";
import { derivePresenceState, getPresence } from "@/lib/desk";
import { isFounderAccessValid } from "@/lib/founder-access";
import type { Metadata } from "next";

// ============================================================================
// THROWAWAY PREVIEW of a restructured /membership. The live page at
// /membership is untouched. This clone exists so Clay can SEE the
// prey-to-operator ladder on a real page before we decide to touch anything.
// Delete this whole route (src/app/membership-preview) when we're done.
//
// What changed vs the live page:
//   1. Masthead deck leads the Desk-as-heartbeat CONCEPT (the inventory
//      dump is gone; the ladder below does that job now).
//   2. The flat six-beat benefits list is replaced by THE LADDER: four
//      rooms as stages of becoming (prey -> operator).
//   3. The Desk MECHANICS (green light, leave a note, "Clay read this")
//      are pulled OUT of the top and moved to a payoff beat right before
//      the ask.
//   4. Case Files stays worded as "coming" (empty shelf).
//   5. Covenant letter + P.S. are copied VERBATIM from the live page.
// ============================================================================

export const metadata: Metadata = {
  title: "Membership (preview)",
  description: "Throwaway restructure preview. Not for indexing.",
  // Keep this out of search + social while it's a scratch page.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The ladder: four rooms as one direction of travel. Each rung carries a
// stage kicker ("where you are"), the room, the body, and the becoming
// line ("who you turn into"). Numerals give it the sense of a climb.
type Rung = {
  n: string;
  stage: string;
  room: string;
  body: string;
  becoming: string;
  /** Case Files is unbuilt (empty shelf) — flag it so the rung can say so. */
  coming?: boolean;
};

const LADDER: Rung[] = [
  {
    n: "01",
    stage: "Where you land",
    room: "The Writer's Desk",
    body:
      "Home base. You walk in and the first thing you see is whether I'm here. Everything else opens off of it.",
    becoming: "You stop being alone in this.",
  },
  {
    n: "02",
    stage: "Where you settle in",
    room: "The Lounge",
    body:
      "The pub. Where the operators talk when I'm heads-down. Hobbies, the news, whatever's on your mind. The room you walk into when you want to be around people who see it the way you do.",
    becoming: "You find your people.",
  },
  {
    n: "03",
    stage: "Where you sharpen",
    room: "The Guild",
    body:
      "The deep room. Bring a real fight. The argument you're losing, the comment battle you're stuck in, the idea you're working out. The room sharpens it, and I'm in there too. The Lounge is for talk. This is for the work.",
    becoming: "You get in the arena.",
  },
  {
    n: "04",
    stage: "Where you get dangerous",
    room: "The Case Files",
    body:
      "Real comment-section battles, dissected. The move the opponent used, why the standard response loses, and the one line you carry into the next fight. The doctrine teaches. The case files drill. First files land soon.",
    becoming: "You stop being prey.",
    coming: true,
  },
];

type ReaderQuote = {
  body: string;
  attribution: string;
};

// Verbatim reader testimonials — same set as the live page.
const READER_QUOTES: ReaderQuote[] = [
  {
    body: "I am a grandmother, a mother, someone who has always been prey... You are the first writer that I have ever paid to listen to. The world I thought I knew has gone. I need to do something!!",
    attribution: "Judy, New Zealand",
  },
  {
    body: "My state legislature has been wrestling with a minimum wage law... Thank you for giving me the proper ways to confront the 'feelings' arguments. Amazingly, no push back when confronted with the value of their labor approach.",
    attribution: "Don, founder",
  },
  {
    body: "Ron Paul's former press secretary here. I am totally with you. You said very well what I have been struggling with since... 2018.",
    attribution: "Rachel Mills",
  },
  {
    body: "Every once in a blue moon a writer comes along and articulates so well, the thoughts that I already have but can't put into words myself. You are one of those writers.",
    attribution: "Sean, founder",
  },
  {
    body: "I never subscribe to things online. Something always stops me... what made me want to be a founder is Clay's earnestness in his quest.",
    attribution: "Trish, founder",
  },
];

type FAQEntry = {
  q: string;
  a: string;
};

const FAQ: FAQEntry[] = [
  {
    q: "what does membership get me?",
    a: "commenting access on every piece, 24 to 48 hours of early access on new essays and walls, and the manuscript when the book lands.",
  },
  {
    q: "what's the founder badge?",
    a: "the first hundred members. they locked $8 a month for as long as they stay subscribed, and they carry a founder badge with their slot number. not a discount. recognition for being first. the cap filled in May 2026.",
  },
  {
    q: "what's the charter badge?",
    a: "after the founder hundred filled, the next 100 sign-ups at the $13 floor claim a charter badge with their slot number. same idea as founder. earned by timing, not amount. locked for as long as they stay subscribed. pay what you want above $13.",
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

export default async function MembershipPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string; access?: string; src?: string }>;
}) {
  const [founderClaimed, charterClaimed, totalMembers, presence] =
    await Promise.all([
      getFounderClaimed(),
      getCharterClaimed(),
      countAllMembers(),
      getPresence(),
    ]);

  const sp = (await searchParams) ?? {};
  const previewArg = sp.preview ?? "";
  const accessParam = typeof sp.access === "string" ? sp.access : "";
  const srcParam = typeof sp.src === "string" ? sp.src : undefined;
  const founderAccess = accessParam
    ? await isFounderAccessValid(accessParam)
    : false;
  const previewCharter =
    process.env.NODE_ENV !== "production" && previewArg === "charter";
  const previewFilled =
    process.env.NODE_ENV !== "production" && previewArg === "filled";

  const effectiveFounderClaimed = previewCharter || previewFilled
    ? FOUNDER_CAP
    : founderClaimed;
  const effectiveCharterClaimed = previewFilled
    ? CHARTER_CAP
    : previewCharter
      ? 0
      : charterClaimed;

  const founderEligible = effectiveFounderClaimed < FOUNDER_CAP;
  const charterEligible =
    !founderEligible && effectiveCharterClaimed < CHARTER_CAP;
  const remaining = Math.max(0, FOUNDER_CAP - effectiveFounderClaimed);
  const charterRemaining = Math.max(
    0,
    CHARTER_CAP - effectiveCharterClaimed
  );

  let heroPrice: string;
  let heroScarcity: string;
  let heroCta: string;
  if (founderAccess) {
    heroPrice = "$8/mo founder rate, locked for life.";
    heroScarcity = "Name your price above the floor.";
    heroCta = "Claim Founder #101";
  } else if (founderEligible) {
    heroPrice = "$8/mo, locked for life.";
    heroScarcity = `${remaining} of 100 founder ${
      remaining === 1 ? "slot" : "slots"
    } left.`;
    heroCta = "Claim your slot";
  } else if (charterEligible) {
    heroPrice = "$13/mo, or pay what it's worth.";
    heroScarcity = `${charterRemaining} charter ${
      charterRemaining === 1 ? "seat remains" : "seats remain"
    }.`;
    heroCta = "Claim your seat";
  } else {
    heroPrice = "$13/mo, or pay what it's worth.";
    heroScarcity = "Full access. Cancel anytime.";
    heroCta = "Join";
  }

  const presenceState = derivePresenceState(presence);

  const stickyPrice =
    founderAccess || founderEligible ? "$8/mo" : "$13/mo";
  const stickyCta = founderAccess ? "Claim your slot" : heroCta;

  return (
    <div>
      {/* Scratch-page banner so nobody mistakes this for the live page. */}
      <div
        className="text-center px-6 py-2 font-display uppercase tracking-[0.22em]"
        style={{
          fontSize: "0.7rem",
          fontWeight: 600,
          background: "var(--paper-deep)",
          borderBottom: "1px solid var(--rule)",
          color: "var(--ink-muted)",
        }}
      >
        Preview · restructure mock · the live page is untouched at{" "}
        <Link href="/membership" className="text-eye-deep hover:text-ink">
          /membership
        </Link>
      </div>

      {/* === Cold-open === KEEP verbatim from live page. */}
      <section>
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-20 md:pb-24">
          <p className="eyebrow text-center mb-10 fade-up stagger-1">
            Membership
          </p>
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

      {/* === Masthead === Headline + front-loaded offer KEEP. The deck is
          REVISED to lead the Desk-as-heartbeat concept; the old "Inside:"
          inventory line is removed (the ladder does that job now). */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-4 md:pt-6 pb-14 text-center">
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

          <div className="max-w-md mx-auto mb-12 fade-up stagger-3">
            {/* REVISED deck — heartbeat first. */}
            <p
              className="font-serif text-ink-muted leading-relaxed mb-6"
              style={{ fontSize: "1.08rem" }}
            >
              There&apos;s a real person on the other side of this, and a
              green light that tells you when I&apos;m at the desk.
              That&apos;s the whole thing. A direct line to me while I
              write, and the rooms that grow up around it.
            </p>
            <p
              className="font-display text-ink leading-none mb-1"
              style={{ fontSize: "1.25rem", fontWeight: 700 }}
            >
              {heroPrice}
            </p>
            <p
              className="font-serif italic text-ink-muted mb-6"
              style={{ fontSize: "0.95rem" }}
            >
              {heroScarcity}
            </p>
            <Link href="#pricing" id="hero-cta" className="btn-primary">
              <span>{heroCta}</span>
            </Link>
            {totalMembers > 0 && (
              <p
                className="font-serif italic text-ink-faint mt-4"
                style={{ fontSize: "0.85rem" }}
              >
                join {totalMembers}{" "}
                {totalMembers === 1 ? "reader" : "readers"} in the room.
              </p>
            )}
          </div>

          {/* === Covenant letter === KEEP verbatim from live page. */}
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

      {/* === Scarcity strip === KEEP verbatim from live page. */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 py-8 md:py-10 text-center">
          {founderAccess ? (
            <>
              <p
                className="eyebrow mb-3"
                style={{ fontSize: "0.72rem", letterSpacing: "0.28em" }}
              >
                Private founder link
              </p>
              <p
                className="font-display text-ink leading-none mb-3"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                Founder #101
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.98rem" }}
              >
                $8/mo founder rate, locked for life. Name your price above
                the floor.
              </p>
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
          ) : founderEligible ? (
            <>
              {totalMembers > 0 && (
                <p
                  className="eyebrow mb-3"
                  style={{ fontSize: "0.72rem", letterSpacing: "0.28em" }}
                >
                  {totalMembers}{" "}
                  {totalMembers === 1 ? "reader" : "readers"} in the room
                </p>
              )}
              <p
                className="font-display text-ink leading-none mb-3"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {effectiveFounderClaimed} of {FOUNDER_CAP} founder spots claimed
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.98rem" }}
              >
                $8/mo locked for life. {remaining}{" "}
                {remaining === 1 ? "slot" : "slots"} left.
              </p>
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
          ) : charterEligible ? (
            <>
              <h2
                className="font-display text-ink leading-none tracking-tight mb-3"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.012em",
                }}
              >
                Charter Membership is open.
              </h2>
              <p
                className="font-serif text-ink leading-snug mb-2"
                style={{ fontSize: "1rem" }}
              >
                100 Founders are seated. {charterRemaining} Charter{" "}
                {charterRemaining === 1 ? "seat remains" : "seats remain"}.
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.95rem" }}
              >
                $13/mo, locked for life. After Charter fills, the rate
                rises.
              </p>
              <p className="mt-5">
                <Link
                  href="#pricing"
                  className="font-display uppercase tracking-[0.24em] text-eye-deep hover:text-ink no-underline transition-colors"
                  style={{ fontSize: "0.75rem", fontWeight: 600 }}
                >
                  Claim your seat &rarr;
                </Link>
              </p>
            </>
          ) : (
            <>
              {totalMembers > 0 && (
                <p
                  className="eyebrow mb-3"
                  style={{ fontSize: "0.72rem", letterSpacing: "0.28em" }}
                >
                  {totalMembers}{" "}
                  {totalMembers === 1 ? "reader" : "readers"} in the room
                </p>
              )}
              <p
                className="font-display text-ink leading-none mb-3"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                founder + charter spots filled
              </p>
              <p
                className="font-serif italic text-ink-muted"
                style={{ fontSize: "0.98rem" }}
              >
                regular tier at $13/mo.
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

      {/* === THE LADDER === NEW. Four rooms as one direction of travel,
          replacing the flat six-beat benefits list. Desk mechanics are
          deliberately held back for the payoff beat below. */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center mb-14">
          <p className="eyebrow mb-4">What you&apos;re stepping into</p>
          <h2
            className="font-display text-ink leading-[1.05] tracking-tight mb-4"
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Four rooms. One direction.
          </h2>
          <p
            className="font-serif italic text-ink-muted"
            style={{ fontSize: "1.08rem" }}
          >
            Prey to operator. Each room is a stage in it.
          </p>
        </div>

        <ol className="space-y-14">
          {LADDER.map((rung) => (
            <li
              key={rung.room}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8"
            >
              {/* Numeral + stage kicker — the climb marker. */}
              <div className="md:col-span-3">
                <p
                  className="font-display text-eye-deep leading-none mb-2"
                  style={{ fontSize: "1.6rem", fontWeight: 700 }}
                >
                  {rung.n}
                </p>
                <p
                  className="eyebrow"
                  style={{ fontSize: "0.72rem", letterSpacing: "0.24em" }}
                >
                  {rung.stage}
                </p>
              </div>

              {/* Room + body + becoming line. */}
              <div className="md:col-span-9">
                <h3
                  className="font-display text-ink leading-snug tracking-tight mb-3 flex items-baseline gap-3 flex-wrap"
                  style={{
                    fontSize: "clamp(1.4rem, 2.5vw, 1.75rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                  }}
                >
                  {rung.room}
                  {rung.coming && (
                    <span
                      className="font-display uppercase tracking-[0.2em] text-ink-faint"
                      style={{
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        border: "1px solid var(--rule)",
                        borderRadius: "999px",
                        padding: "0.2rem 0.6rem",
                      }}
                    >
                      Coming
                    </span>
                  )}
                </h3>
                <p
                  className="font-serif text-ink leading-relaxed mb-4"
                  style={{ fontSize: "1.05rem" }}
                >
                  {rung.body}
                </p>
                <p
                  className="font-serif italic text-eye-deep leading-snug"
                  style={{ fontSize: "1.02rem" }}
                >
                  &rarr; {rung.becoming}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* Ladder close line — names the arc. */}
        <p
          className="font-serif text-ink text-center leading-relaxed mt-16 max-w-xl mx-auto"
          style={{ fontSize: "1.15rem" }}
        >
          Alone, to among your own, to in the arena, to dangerous.
          That&apos;s the path. That&apos;s the membership.
        </p>

        {/* Supporting inventory folded to one quiet line so nothing real
            is lost, without giving these their own rung. */}
        <p
          className="font-serif italic text-ink-faint text-center leading-relaxed mt-8 max-w-xl mx-auto"
          style={{ fontSize: "0.92rem" }}
        >
          Also inside: members-only comments under every essay, early
          access to new work, and the book as it&apos;s written.
        </p>
      </section>

      <EyeDivider />

      {/* === Reader proof === KEEP verbatim from live page. */}
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
                    {quote.attribution}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <EyeDivider />
        </>
      )}

      {/* === Desk mechanics payoff === NEW placement. The heartbeat was
          promised up top; here's where it's shown, right before the ask.
          Carries the live presence pill so the "green light" is concrete. */}
      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16 text-center">
        <p className="eyebrow mb-4">Back to the desk</p>
        <h2
          className="font-display text-ink leading-tight tracking-tight mb-6"
          style={{
            fontSize: "clamp(1.9rem, 3.5vw, 2.6rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          The light is the promise.
        </h2>
        <div className="desk-presence-demo mb-8 flex justify-center">
          <DeskPresenceIndicator
            initialState={presenceState}
            href="/desk"
          />
        </div>
        <div className="max-w-xl mx-auto text-left space-y-5">
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            You log in, you see if I&apos;m at the desk. A green light
            pulses next to my name while I&apos;m working. When I step
            away, you know that too. You see what I&apos;m thinking, what
            I&apos;m reading, what I&apos;m working on. You can leave a
            note any time. I read every one, and I write back.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            No other writer will let you this close. When the light&apos;s
            on, I&apos;m right here.
          </p>
        </div>
      </section>

      <EyeDivider />

      {/* === Pricing + P.S. === KEEP verbatim from live page. */}
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
          founderEligible={founderAccess || founderEligible}
          founderClaimed={effectiveFounderClaimed}
          charterEligible={founderAccess ? false : charterEligible}
          charterClaimed={effectiveCharterClaimed}
          totalMembers={totalMembers}
          privateFounderAccess={founderAccess}
          accessToken={founderAccess ? accessParam : undefined}
          source={srcParam}
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
            Predator and Prey is where the doctrine landed in its
            sharpest form.{" "}
            <Link
              href="/founding/predator-or-prey"
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

      {/* === Pay it forward === KEEP verbatim from live page. */}
      <section className="max-w-2xl mx-auto px-6 text-center">
        <p className="eyebrow mb-4">Pay it forward</p>
        <p
          className="font-serif text-ink leading-relaxed mb-7 max-w-md mx-auto"
          style={{ fontSize: "1.05rem" }}
        >
          Know someone who needs to be in this room? Buy them a seat. One
          charge, a fixed term, full membership. They get an email with
          your name on it.
        </p>
        <Link href="/membership/gift" className="btn-primary">
          <span>Give someone a seat</span>
        </Link>

        {/* The other end of the same mechanism: moved here from the free-
            email footer so give-a-seat and need-a-seat sit together.
            Understated by design so it never competes with the gift CTA. */}
        <p
          className="font-serif text-ink-muted leading-relaxed mt-9"
          style={{ fontSize: "0.95rem" }}
        >
          Or you&apos;re the one who needs a seat? Can&apos;t swing it right
          now?{" "}
          <Link
            href="/membership/pool"
            className="text-eye-deep hover:text-ink"
          >
            There&apos;s another way in.
          </Link>
        </p>
      </section>

      <EyeDivider />

      {/* === FAQ === KEEP verbatim from live page. */}
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

      <EyeDivider />

      {/* === Non-buyer safety net === KEEP verbatim from live page. */}
      <section className="max-w-2xl mx-auto px-6 py-14 md:py-20 text-center">
        <p className="eyebrow mb-4">Not ready to join?</p>
        <p
          className="font-serif text-ink leading-relaxed mb-7 max-w-md mx-auto"
          style={{ fontSize: "1.05rem" }}
        >
          The essays are free. Get them in your inbox and step closer when
          you&apos;re ready. Algorithms don&apos;t deliver this writing. It
          only arrives if you ask.
        </p>
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
          ← back home
        </Link>
      </div>

      <div aria-hidden="true" className="h-20 md:hidden" />

      <StickyJoinBar priceLabel={stickyPrice} ctaLabel={stickyCta} />
    </div>
  );
}
