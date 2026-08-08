import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  getAllCaseFiles,
  getPublicCaseFiles,
  RULE_SHORT_LABEL,
  type CaseFile,
} from "@/lib/case-files";
import {
  CHARTER_CAP,
  FOUNDER_CAP,
  getCharterClaimed,
  getFounderClaimed,
} from "@/lib/members";
import { markOnboardingStep } from "@/lib/onboarding";
import { EmailSignup } from "@/components/EmailSignup";
import { SubscriberCount } from "@/components/SubscriberCount";

// The Rules of Engagement — the public front door. The doctrine is the
// lure; practice (the Case Files, the Guild, Clay's presence) is the
// paid product. So this page is PUBLIC, but it deepens when signed in:
// a stranger gets the axiom and seven rules clean plus a "join to train" CTA;
// a member gets the same rules plus the enrichments (case files
// demonstrating each rule, demonstrated-in field notes) and the
// onboarding tick. Same single page, auth-aware — the pattern mirrors
// the public-preview case files.
//
// Lives at the top-level /rules (NOT under /notes/*), which the proxy
// gates. Old members' links to /notes/rules get a 301 here in proxy.ts.

// See about/page.tsx: override social-card text or it inherits the generic
// root copy. Card image comes from opengraph-image.tsx.
const RULES_DESCRIPTION =
  "Seven rules. The predator-prey doctrine of engagement. They explain every political conversation you've ever lost.";

export const metadata: Metadata = {
  title: "Rules of Engagement",
  description: RULES_DESCRIPTION,
  openGraph: {
    title: "Rules of Engagement · Stop Being Prey",
    description: RULES_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rules of Engagement · Stop Being Prey",
    description: RULES_DESCRIPTION,
    creator: "@stopbeingprey",
  },
};

export const dynamic = "force-dynamic";

type Rule = {
  number: number;
  title: string;
  body: string;
  /** Optional slug of a Field Note that demonstrates this rule in
      action. Renders as "Demonstrated in: ..." beneath the body. */
  demoSlug?: string;
};

const RULES: Rule[] = [
  {
    number: 1,
    title: "Refuse their traps.",
    body: "They've spent fifty years building the ground you keep losing on. The gotcha question. The fake position they put in your mouth so they can knock it down. Most of politics is good people walking into these one after another. That's what being prey is. Not weakness, just reacting to a trap you never saw coming. The second you're defending something you never said, you've already lost. The trap only springs on prey that takes the bait. So don't.",
  },
  {
    number: 2,
    title: "Lay your own. Make them come to you.",
    body: "Stop reacting. Start building. Set the ground, ask the question, drop the bait, and let them charge it. When they show up swinging, they're not attacking you. They're walking onto a stage you built, into a fight you already won. That's the whole difference between predator and prey. Prey fights on ground it didn't pick. The predator decides where the fight happens.",
  },
  {
    number: 3,
    title: "The audience is the prize. The opponent is the evidence.",
    body: "You're not arguing to the guy across from you. You'll probably never change his mind, and you don't need to. You're arguing to everyone reading in silence who hasn't picked a side. He's not your enemy. He's your evidence. Take him apart in the open and he becomes the exhibit, the proof of everything you're showing the room. He volunteered for it. Most of them do.",
  },
  {
    number: 4,
    title: "Name the move. Refuse it. Set your frame.",
    body: "Every bad-faith move has a shape, and the moment you name it, it stops working. The dodge. The fake outrage. The ten things you're suddenly supposed to answer at once. Say it out loud so the room can see it: here's the trick he just tried. Then you stop answering his question and ask your own. Whoever sets the frame wins. Reacting to his frame is what prey does. You set your own, and make him live in it.",
  },
  {
    number: 5,
    title: "Silence is a verdict.",
    body: "You don't fight everyone. Some people pay no price for being wrong, so they'll argue forever and never concede. They came to extract from you. To extract your energy, to push your buttons, to make you react, to borrow your audience. Answer, and you're in their trap. Walk away, and they get nothing.",
  },
  {
    number: 6,
    title: "Devastate, then grace.",
    body: "Take the argument apart completely. Leave nothing standing. And then, from the position of total dominance, extend your hand. The grace isn't weakness and it isn't retreat. You've already won by the time you offer it. Anyone can be cruel. Anyone can be a pushover. A man who can devastate you and still wish you well is operating from a place you can't touch.",
  },
  {
    number: 7,
    title: "Their hostility feeds you.",
    body: "Every attack is a meal. They show up to take something from you, your time, your name, your peace, and you feed on it instead. It draws the audience, sharpens the doctrine, builds your name. The prey that bites the predator only makes him stronger. The people who come to tear the work down are the ones who end up feeding it.",
  },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// The axiom sits above the rules: not a numbered rule, the premise the
// seven rest on. Rendered as a distinct, weightier framed statement
// between the hero and the rule list. Copy is the author's, verbatim.
const AXIOM = {
  eyebrow: "The Axiom",
  title: "Power decides, not righteousness.",
  body: "It feels like being correct should be enough, but politics doesn't reward correctness. It rewards effectiveness. These are not the same thing. The most basic question is not what is best, but who decides what is best. Power decides. Whoever decides what counts as true, wins. You've just been too busy being correct to notice you weren't deciding anything.",
  founding: {
    title: "The Losertarian Problem",
    href: "/the-losertarian-problem",
  },
};

// Rules that expand into a founding-text essay carry a quiet
// "Read the full essay" footnote. The founding essays are public, so
// these pointers show for strangers and members alike — they reinforce
// the doctrine and pull cold traffic deeper. Add new entries here as
// more founding pieces ship; the renderer picks them up automatically.
const FOUNDING_LINK_BY_RULE: Record<
  number,
  { title: string; href: string }
> = {
  6: {
    title: "We Pray For Our Prey",
    href: "/founding/we-pray-for-our-prey",
  },
};

export default async function RulesPage() {
  // Auth-aware: a signed-in member sees the enrichments (case files
  // demonstrating each rule, demonstrated-in field notes) and ticks the
  // onboarding step; a stranger sees the clean doctrine plus a join CTA.
  const cookieStore = await cookies();
  let signedIn = false;
  try {
    const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
    if (session?.email) {
      signedIn = true;
      // Visiting the Rules ticks that onboarding step. Cheap, and never
      // allowed to break the page.
      await markOnboardingStep(session.email, "rules");
    }
  } catch {
    // no-op
  }

  // The doctrine is fully public now: every reader gets all seven rules,
  // no email wall. The page still deepens when signed in (member
  // enrichments below) and shows non-members the join + email asks at the
  // foot, after the value, instead of as a tollbooth in front of it.

  // Live offer state for the stranger CTA only — members never see it,
  // so skip the Redis reads for them. Mirrors the /membership state
  // machine: while founder seats remain it's the $8 founder pitch; once
  // founders fill, it's the $13 charter pitch with charter seats
  // remaining; when both caps fill, the plain $13 floor. Keeps the
  // doctrine front door in step with the real checkout.
  const [founderClaimed, charterClaimed] = signedIn
    ? [FOUNDER_CAP, CHARTER_CAP]
    : await Promise.all([getFounderClaimed(), getCharterClaimed()]);
  const founderEligible = founderClaimed < FOUNDER_CAP;
  const charterEligible = !founderEligible && charterClaimed < CHARTER_CAP;
  const founderRemaining = Math.max(0, FOUNDER_CAP - founderClaimed);
  const charterRemaining = Math.max(0, CHARTER_CAP - charterClaimed);

  // The live seat pitch, shared by the unlock gate's membership path and
  // the foot-of-page "Join to train" CTA so both track the same checkout
  // state and never drift.
  const seatLine = founderEligible
    ? `${founderRemaining} founder seat${
        founderRemaining === 1 ? "" : "s"
      } left. $8/month locked for life. When the last fills, $13 forever.`
    : charterEligible
      ? `${charterRemaining} charter seat${
          charterRemaining === 1 ? "" : "s"
        } left. $13/month floor, or pay what it's worth. Your rate locked for life, with your slot number.`
      : "$13/month floor, or pay what it's worth. Locked for life.";

  // Reverse index: rule number → case files that reference it.
  // Built once at render time so each rule body can pull its
  // demonstrating cases with a single map lookup. Sort within each
  // bucket newest-first so the most recent demonstration leads.
  const caseFilesByRule = new Map<number, CaseFile[]>();
  for (const cf of getAllCaseFiles()) {
    for (const ruleNumber of cf.rulesApplied) {
      const bucket = caseFilesByRule.get(ruleNumber) ?? [];
      bucket.push(cf);
      caseFilesByRule.set(ruleNumber, bucket);
    }
  }

  // The bridge for a just-unlocked (email) reader: the top public-preview
  // case file, surfaced as "the doctrine drilled against a live kill." It
  // turns the abstract membership pitch into concrete proof at the highest-
  // intent moment in the funnel. Null if no case file is public yet.
  const bridgeCase = getPublicCaseFiles()[0] ?? null;
  const bridgeRule = bridgeCase?.rulesApplied[0];

  // Full rule card (numeral, title, body, member enrichments). Shared by the
  // unlocked all-seven list and the locked free-rules list.
  const fullRuleCard = (rule: Rule, idx: number) => {
    // Field-note "Demonstrated in" links retired with the journal
    // format (2026-08-08); case files carry the demonstration role.
    const demoCases = signedIn ? caseFilesByRule.get(rule.number) ?? [] : [];
    return (
      <Fragment key={rule.number}>
        {idx > 0 && (
          <li aria-hidden="true" className="rule-divider-li">
            <div className="rule-divider">·</div>
          </li>
        )}
        <li id={`rule-${rule.number}`} className="rule-card">
          <div className="flex items-baseline gap-5 md:gap-8">
            <span className="rule-numeral" aria-hidden="true">
              {ROMAN[rule.number - 1]}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="rule-title">
                <span className="sr-only">Rule {rule.number}:</span>
                {rule.title}
              </h3>
              <div className="rule-body">
                {rule.body.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              {demoCases.length > 0 && (
                <div className="mt-5">
                  <p
                    className="eyebrow mb-2"
                    style={{ fontSize: "0.62rem", letterSpacing: "0.28em" }}
                  >
                    Case files demonstrating this rule
                  </p>
                  <ul className="rule-demo list-none p-0 m-0 flex flex-col gap-1">
                    {demoCases.map((cf) => (
                      <li key={cf.slug}>
                        <Link href={`/case-files/${cf.slug}`}>
                          Case File №{cf.number} &middot; {cf.title}
                        </Link>{" "}
                        &rarr;
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {FOUNDING_LINK_BY_RULE[rule.number] && (
                <p
                  className="font-serif italic text-ink-muted leading-relaxed mt-8"
                  style={{ fontSize: "0.98rem" }}
                >
                  Read the full essay:{" "}
                  <Link
                    href={FOUNDING_LINK_BY_RULE[rule.number].href}
                    className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
                    style={{ fontWeight: 600 }}
                  >
                    {FOUNDING_LINK_BY_RULE[rule.number].title} &rarr;
                  </Link>
                </p>
              )}
            </div>
          </div>
        </li>
      </Fragment>
    );
  };

  return (
    <div className="rules-paper">
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">The Doctrine</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Rules of Engagement.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Seven rules. The predator-prey doctrine of engagement.
            Memorize them. They explain every political conversation
            you&apos;ve ever lost.
          </p>
        </div>
      </section>

      {/* The Axiom. Not a numbered rule, the premise the seven rest on.
          Set apart as a weightier framed statement (olive top/bottom
          rules, paper-deep field, display title) so it reads as the
          floor of the doctrine rather than the first card. Carries the
          Losertarian founding pointer beneath. */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
          <div
            className="text-center px-6 py-9 md:px-10 md:py-12"
            style={{
              background: "var(--paper-deep)",
              borderTop: "2px solid var(--eye-deep)",
              borderBottom: "2px solid var(--eye-deep)",
            }}
          >
            <p
              className="eyebrow mb-5"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.32em",
                fontWeight: 600,
                color: "var(--eye-deep)",
              }}
            >
              {AXIOM.eyebrow}
            </p>
            <h2
              className="font-display text-ink leading-tight mb-5"
              style={{
                fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {AXIOM.title}
            </h2>
            <p
              className="font-serif text-ink-soft max-w-2xl mx-auto"
              style={{ fontSize: "1.08rem", lineHeight: 1.7 }}
            >
              {AXIOM.body}
            </p>
            <p
              className="font-serif italic text-ink-muted leading-relaxed mt-7"
              style={{ fontSize: "0.98rem" }}
            >
              Read the full essay:{" "}
              <Link
                href={AXIOM.founding.href}
                className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
                style={{ fontWeight: 600 }}
              >
                {AXIOM.founding.title} &rarr;
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        {/* The whole doctrine, public, one continuous list. Members get the
            same seven plus the enrichments inside each card. */}
        <ol className="rule-list" role="list">
          {RULES.map((rule, idx) => fullRuleCard(rule, idx))}
        </ol>

        {/* Foot asks — non-members only; members are already in, so the page
            ends after the doctrine. After the value, two asks: take a seat
            (the paid room), or for those not ready, take the writing by
            email. No wall in front of the doctrine, only an invitation
            after it. */}
        {signedIn ? null : (
          <>
            {/* Bridge: doctrine just read -> proof it works -> membership.
                Shows the top public case file as the live drill. Copy is
                first-pass, Clay's to sharpen. */}
            {bridgeCase && (
              <div className="mt-14">
                <p
                  className="eyebrow mb-4"
                  style={{
                    fontSize: "0.86rem",
                    letterSpacing: "0.28em",
                    fontWeight: 600,
                    color: "var(--eye-deep)",
                  }}
                >
                  Now watch it work
                </p>
                <p
                  className="font-serif text-ink mb-5"
                  style={{ fontSize: "1.1rem", lineHeight: 1.65 }}
                >
                  You have the rules. Here&apos;s one used on a live target,
                  taken apart move by move.
                </p>
                <Link
                  href={`/case-files/${bridgeCase.slug}`}
                  className="case-card no-underline block"
                >
                  <p
                    className="eyebrow mb-2"
                    style={{ fontSize: "0.62rem", letterSpacing: "0.28em" }}
                  >
                    Case File №{bridgeCase.number} &middot;{" "}
                    {bridgeCase.archetype}
                  </p>
                  <p
                    className="font-display text-ink mb-2"
                    style={{
                      fontSize: "1.3rem",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {bridgeCase.title}
                  </p>
                  {bridgeRule && RULE_SHORT_LABEL[bridgeRule] && (
                    <p
                      className="font-serif italic text-ink-muted mb-3"
                      style={{ fontSize: "0.95rem" }}
                    >
                      Rule {ROMAN[bridgeRule - 1]} in the field:{" "}
                      {RULE_SHORT_LABEL[bridgeRule]}.
                    </p>
                  )}
                  <span
                    className="text-eye-deep"
                    style={{ fontWeight: 600 }}
                  >
                    Read the case file &rarr;
                  </span>
                </Link>
              </div>
            )}
            <div
              className="mt-10 px-6 py-7 md:px-9 md:py-8"
              style={{
                background: "var(--paper-deep)",
                borderLeft: "2px solid var(--eye-deep)",
              }}
            >
            <p
              className="eyebrow mb-5"
              style={{
                fontSize: "0.86rem",
                letterSpacing: "0.28em",
                fontWeight: 600,
                color: "var(--eye-deep)",
              }}
            >
              Join to train
            </p>
            <p
              className="font-serif text-ink mb-4"
              style={{ fontSize: "1.1rem", lineHeight: 1.65 }}
            >
              These rules are free. Follow them, and you will never lose a
              political argument again.
            </p>
            <p
              className="font-serif text-ink mb-5"
              style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
            >
              Want help? Join my room. That&apos;s where we train. We take
              apart real fights in the Case Files together. In a fight right
              now, or see one coming? Bring it to me first.
            </p>
            <p
              className="font-serif text-ink-soft mb-5"
              style={{ fontSize: "1rem", lineHeight: 1.65 }}
            >
              {seatLine}
            </p>
            <p>
              <Link
                href="/membership?src=rules"
                className="text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontWeight: 600 }}
              >
                Take a seat &rarr;
              </Link>
            </p>
            </div>

            {/* The softer ask, sitting under the seat: not ready to pay, but
                moved. Take the writing free. Lower-key than the seat box so
                the hierarchy reads seat-first, email-as-fallback. Signups
                here attribute to source "rules". Copy is first-pass. */}
            <div className="mt-10 text-center">
              <p
                className="font-serif text-ink mb-1"
                style={{ fontSize: "1.1rem", lineHeight: 1.6 }}
              >
                Not ready for a seat? Stick to my writing.
              </p>
              <p
                className="font-serif text-ink-muted mb-4"
                style={{ fontSize: "1rem", lineHeight: 1.6 }}
              >
                I write nearly every day. It&apos;s free, straight to your
                inbox.
              </p>
              {/* Audience proof, same live Kit count shown on the other email
                  surfaces. Authority at 9k+, and keeps Rules consistent. */}
              <SubscriberCount className="mb-4" />
              <div className="flex justify-center">
                <EmailSignup source="rules" submitLabel="Send it" />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
