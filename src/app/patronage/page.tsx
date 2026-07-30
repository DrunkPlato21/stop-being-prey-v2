import Link from "next/link";
import { MembershipPlans } from "@/components/MembershipPlans";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import {
  CHARTER_CAP,
  FOUNDER_CAP,
  countAllMembers,
  getCharterClaimed,
  getFounderClaimed,
} from "@/lib/members";
import { isFounderAccessValid } from "@/lib/founder-access";
import { testimonialsFor } from "@/lib/testimonials";
import type { Metadata } from "next";

// The patronage page. A second, separate front door to the same Stripe
// checkout as /membership — NOT a replacement for it, and it does not
// import from it. The two pages differ only in frame:
//
//   /membership  sells access. Feature list first, floor price first,
//                badge preview, scarcity strip up top.
//   /patronage   sells the work. One ask, the rate widget near the top
//                with the largest amounts leading, the letter and the
//                reader proof carrying the argument, and every feature
//                demoted to fine print at the bottom.
//
// The reason for the split: most paying members never sign in. They are
// patrons, not users. A feature list is the wrong pitch for them, but it
// is still the right pitch for the reader who does want the rooms — so
// both pages stay live and each gets its own audience.
//
// Body copy here is lifted verbatim from /membership. Anything that
// needed NEW words is marked with a COPY SLOT comment and is Clay's to
// write; nothing in a COPY SLOT should ship as-is.

export const metadata: Metadata = {
  title: "Patronage",
  description:
    "Back the writing. Set your own rate, monthly or annual, and keep me at the desk.",
  // NOINDEX while the copy slots are still placeholders. Delete this
  // `robots` block (and add the page to src/app/sitemap.ts) on the day
  // this goes live — those are the only two steps between here and
  // indexable.
  robots: { index: false, follow: false },
};

// Counters render fresh per request so the remaining-seat numbers are
// honest. Same reasoning as /membership.
export const dynamic = "force-dynamic";

// Verbatim from /membership. Demoted to fine print here — the full text
// is kept so nothing is lost, only the typographic weight changes.
type Benefit = {
  eyebrow: string;
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
    eyebrow: "Case Files",
    body: [
      "Where the Rules come alive. Real comment-section battles dissected, with the actual lines you can deploy when it happens to you. You can submit your own.",
    ],
  },
  {
    eyebrow: "the Guild",
    body: [
      "The deep room, and the closest you can get to me. Bring a real fight: the argument you're losing, the comment battle you're stuck in, the idea you're working out. The room sharpens it, and I'm in there too. The Lounge is for talk. This is for the work.",
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

const READER_QUOTES = testimonialsFor("membership");

type FAQEntry = { q: string; a: string };

// Verbatim from /membership.
const FAQ: FAQEntry[] = [
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

export default async function PatronagePage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string; access?: string; src?: string }>;
}) {
  const [founderClaimed, charterClaimed, totalMembers] = await Promise.all([
    getFounderClaimed(),
    getCharterClaimed(),
    countAllMembers(),
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

  const effectiveFounderClaimed =
    previewCharter || previewFilled ? FOUNDER_CAP : founderClaimed;
  const effectiveCharterClaimed = previewFilled
    ? CHARTER_CAP
    : previewCharter
      ? 0
      : charterClaimed;

  const founderEligible = effectiveFounderClaimed < FOUNDER_CAP;
  const charterEligible =
    !founderEligible && effectiveCharterClaimed < CHARTER_CAP;
  const remaining = Math.max(0, FOUNDER_CAP - effectiveFounderClaimed);
  const charterRemaining = Math.max(0, CHARTER_CAP - effectiveCharterClaimed);

  // Scarcity is real information (the rate really does lock), so it stays
  // on the page — but as one quiet line under the widget instead of the
  // full-width strip /membership runs above the fold. On the patronage
  // frame the seat count is a footnote to the ask, not the ask.
  let rateNote: string;
  if (founderAccess) {
    rateNote = "$8/mo founder rate, locked for life. Name your price above the floor.";
  } else if (founderEligible) {
    rateNote = `$8/mo locked for life. ${remaining} of ${FOUNDER_CAP} founder ${
      remaining === 1 ? "slot" : "slots"
    } left.`;
  } else if (charterEligible) {
    rateNote = `$13/mo locked for life. ${charterRemaining} charter ${
      charterRemaining === 1 ? "seat remains" : "seats remain"
    }.`;
  } else {
    rateNote = "$13/mo floor. Cancel anytime.";
  }

  return (
    <div>
      {/* ============================================================
          1. THE ASK. Headline, one line of framing, then straight into
          the rate widget. No feature inventory above the fold, no
          scarcity strip, no second button competing with the ask.
          ============================================================ */}
      <section>
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-4 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Patronage</p>

          {/* COPY SLOT — headline. Placeholder. /membership's H1 is
              "In the room with me.", which is an access promise and the
              wrong frame here. This one should be about backing the
              work. Clay writes it. */}
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            [HEADLINE]
          </h1>

          {/* COPY SLOT — one line under the headline. What the money
              does, in a sentence. Placeholder. */}
          <p
            className="font-serif text-ink-muted leading-relaxed max-w-xl mx-auto fade-up stagger-3"
            style={{ fontSize: "1.12rem" }}
          >
            [ONE LINE. What backing the work actually does.]
          </p>
        </div>
      </section>

      {/* The one loud action on the page. Largest amounts lead; the
          badge preview is off (badges are fine print in this frame). */}
      <section
        id="support"
        className="max-w-3xl mx-auto px-6 pt-6 pb-14 md:pb-20"
        style={{ scrollMarginTop: "2rem" }}
      >
        <MembershipPlans
          founderEligible={founderAccess || founderEligible}
          founderClaimed={effectiveFounderClaimed}
          charterEligible={founderAccess ? false : charterEligible}
          charterClaimed={effectiveCharterClaimed}
          totalMembers={totalMembers}
          privateFounderAccess={founderAccess}
          accessToken={founderAccess ? accessParam : undefined}
          source={srcParam}
          presetOrder="descending"
          showBadgePreview={false}
          ctaVerb="support the work"
        />

        <p
          className="font-serif italic text-ink-faint text-center mt-5"
          style={{ fontSize: "0.88rem" }}
        >
          {rateNote}
        </p>

        <p className="text-center mt-8">
          <Link
            href="/notes/sign-in"
            className="font-display text-xs uppercase tracking-[0.22em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            already a member? sign in &rarr;
          </Link>
        </p>
      </section>

      <EyeDivider />

      {/* ============================================================
          2. THE LETTER. Verbatim from /membership. This copy was
          already patronage copy — it argues for supporting the work,
          not for using a product. It carries the page.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="max-w-xl mx-auto space-y-5">
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            For ten years I&apos;ve run the largest Thomas Sowell quotes page
            on Facebook. I built ReadSowell.com, a quotes database with
            proper sourcing, no misattributions, every quote linked to its
            source. I&apos;m a software engineer by trade. I&apos;m becoming
            a writer out of necessity. That&apos;s a skill stack Scott Adams
            would call rare.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            Two months ago I went full time on the writing. You readers were
            a big part of that decision... the responses to my work have been
            overwhelming. You&apos;re practically begging me to write full
            time. You&apos;ve even sent me tips! Real money! Okay I guess we
            have something real here...
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            This membership is the foundation that makes it sustainable. Not
            sporadic... Structural. Your support is what keeps me at the
            desk. If I can get enough of you on board, I can dedicate 100% of
            my time to writing and not worry about anything else. That&apos;s
            the goal.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            What I&apos;m offering isn&apos;t a content library... it&apos;s
            access to watch the doctrine form in real time. You&apos;ll see
            drafts. You&apos;ll see the moves I&apos;m making as I make them.
            You&apos;ll see the framework take shape while it&apos;s
            happening, not after. Few writers offer this. Almost none.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            I never thought my work would carry this kind of weight... but it
            is. The way readers are writing to me lately, it&apos;s starting
            to become clear. I&apos;ve figured something out that needs to
            get out. People are starting to see me as someone who sees things
            clearly... I fear they might be right...
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            I feel the burden of that too. I&apos;m not sure I&apos;ve earned
            it yet. I&apos;ll work to earn it.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            This project exists because I&apos;m asking readers who&apos;ve
            been with me on Facebook, on the email list, in the comments, to
            step closer. To put real money on the table so I can keep
            building. In return, I owe you everything I have.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1.08rem" }}
          >
            I&apos;ll be at the desk every day. That&apos;s the contract.
          </p>
        </div>
      </section>

      <EyeDivider />

      {/* ============================================================
          3. PROOF. The reader anecdote, then the testimonials. Both
          verbatim. On /membership the anecdote is the cold open and the
          quotes sit buried between the features and the price. Here they
          are the argument: this is what the money is paying for.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div
          className="max-w-2xl mx-auto font-serif text-ink space-y-5"
          style={{ fontSize: "1.18rem", lineHeight: 1.62 }}
        >
          <p>
            A reader emailed me last month. He&apos;s a consultant. His firm
            had just proposed a &ldquo;race-aware session&rdquo; at a board
            meeting. He was sitting there with the decision on the table and
            had to respond on the spot.
          </p>
          <p>
            He wrote a rebuttal in the chat using what he&apos;d learned from
            my work. He pre-empted the pushback he knew was coming. He sent
            me the whole exchange afterward and asked: &ldquo;How did I
            do?&rdquo;
          </p>
          <p>He did it right. The framing went into the room.</p>
        </div>
      </section>

      {READER_QUOTES.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 pb-14 md:pb-20">
          <div className="text-center mb-8">
            <p className="eyebrow">What readers have been writing</p>
          </div>
          <ul className="space-y-8 max-w-2xl mx-auto">
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
      )}

      <EyeDivider />

      {/* ============================================================
          4. THE CLOSE. P.S. block verbatim, then a text link back up to
          the widget. Deliberately NOT a button: the page has exactly one
          btn-primary and it is the subscribe action above.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="max-w-xl mx-auto space-y-5">
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
            I don&apos;t know what the piece did for him. He just felt he had
            to say it. The work means something. I want to keep earning that.
          </p>
          <p
            className="font-serif text-ink leading-relaxed"
            style={{ fontSize: "1rem" }}
          >
            If you haven&apos;t read the founding piece yet, read it first.
            Predator and Prey is where the doctrine landed in its sharpest
            form.{" "}
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

        <p className="text-center mt-12">
          <Link
            href="#support"
            className="font-display uppercase tracking-[0.24em] text-eye-deep hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.78rem", fontWeight: 600 }}
          >
            Set your rate &uarr;
          </Link>
        </p>
      </section>

      <EyeDivider />

      {/* ============================================================
          5. FINE PRINT. Every feature beat, full text, demoted. Smaller
          type, tighter rhythm, and a header that says out loud that none
          of it is required. This is the whole point of the page: the
          patron is not buying a login.
          ============================================================ */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="max-w-xl mx-auto">
          <p className="eyebrow mb-3">If you do want the rooms</p>
          {/* COPY SLOT — one line saying the rooms are there but nobody
              has to use them. Placeholder. */}
          <p
            className="font-serif italic text-ink-muted leading-relaxed mb-10"
            style={{ fontSize: "0.98rem" }}
          >
            [ONE LINE. The rooms exist, you never have to open them.]
          </p>

          <ul className="space-y-8">
            {BENEFITS.map((b) => (
              <li key={b.eyebrow}>
                <p
                  className="eyebrow mb-2"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.26em" }}
                >
                  {b.eyebrow}
                </p>
                <div className="space-y-3">
                  {b.body.map((para, i) => (
                    <p
                      key={i}
                      className="font-serif text-ink-muted leading-relaxed"
                      style={{ fontSize: "0.95rem" }}
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <EyeDivider />

      {/* FAQ. Verbatim from /membership, minus the "what does membership
          get me?" entry — that question's answer is the fine-print block
          directly above it now. */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center mb-10">
          <p className="eyebrow">Questions</p>
        </div>
        <dl className="space-y-9 max-w-xl mx-auto">
          {FAQ.map((entry) => (
            <div key={entry.q} className="border-l-2 border-rule pl-6">
              <dt
                className="font-display text-ink mb-2"
                style={{ fontSize: "1.15rem", fontWeight: 600 }}
              >
                {entry.q}
              </dt>
              <dd
                className="font-serif text-ink-muted leading-relaxed"
                style={{ fontSize: "0.98rem" }}
              >
                {entry.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <EyeDivider />

      {/* ============================================================
          6. THE OTHER DOORS. Gift a seat, join the free list, or take a
          funded seat. All three are quiet text-weight links. None of
          them is a button — the ask at the top owns that weight.
          ============================================================ */}
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

        <p
          className="font-serif text-ink-muted leading-relaxed mt-10"
          style={{ fontSize: "0.95rem" }}
        >
          Know someone who needs to be in this room?{" "}
          <Link
            href="/membership/gift"
            className="text-eye-deep hover:text-ink"
          >
            Buy them a seat.
          </Link>
        </p>
        <p
          className="font-serif text-ink-muted leading-relaxed mt-3"
          style={{ fontSize: "0.95rem" }}
        >
          Can&apos;t afford it right now?{" "}
          <Link href="/membership/pool" className="text-eye-deep hover:text-ink">
            There&apos;s another way in.
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
