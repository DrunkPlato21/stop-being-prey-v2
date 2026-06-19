import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getAllFieldNotes, type FieldNoteMeta } from "@/lib/field-notes";
import { getAllCaseFiles, type CaseFile } from "@/lib/case-files";
import {
  CHARTER_CAP,
  FOUNDER_CAP,
  getCharterClaimed,
  getFounderClaimed,
} from "@/lib/members";
import { markOnboardingStep } from "@/lib/onboarding";

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

export const metadata: Metadata = {
  title: "Rules of Engagement",
  description:
    "Seven rules. The predator-prey doctrine of engagement. They explain every political conversation you've ever lost.",
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
    body: "They've spent fifty years building the ground you keep losing on. The gotcha question. The fake position they put in your mouth so they can knock it down. The word your tribe handed them to end the conversation before it starts. Most of politics is good people walking into these one after another. That's what being prey is. Not weakness, just reacting to a trap you never saw coming. Learn to feel the trap before you step in it. The second you're defending something you never said, you've already lost. Don't pick up the rope.",
  },
  {
    number: 2,
    title: "Lay your own. Make them come to you.",
    body: "Stop reacting. Start building. Set the ground, ask the question, drop the bait, and let them charge it. When they show up swinging, they're not attacking you. They're walking onto a stage you built, into a fight you already won. That's the whole difference between predator and prey. The prey waits to get hit. The predator decides where the fight happens. Welcome them to your territory.",
  },
  {
    number: 3,
    title: "The audience is the prize. The opponent is the evidence.",
    body: "You're not arguing to him. You'll probably never change his mind, and you don't need to. You're arguing to everyone reading in silence who hasn't picked a side. He's not your enemy. He's your evidence. Take him apart in the open and he becomes the exhibit, the proof of everything you're showing the room. He volunteered for it. Most of them do.",
  },
  {
    number: 4,
    title: "Name the move. Refuse it. Set your frame.",
    body: "Every bad-faith move has a shape, and the moment you name it, it stops working. The dodge. The fake outrage. The ten things you're suddenly supposed to answer at once. Say it out loud so the room can see it: here's the trick he just tried. Then you stop answering his question and ask your own. Whoever sets the frame wins. Reacting to his frame is what prey does. You set your own, and make him live in it.",
  },
  {
    number: 5,
    title: "Silence is a verdict. Walking away wins.",
    body: "Some people pay no price for being wrong, so they'll argue forever. Your attention is the only thing they came for. Don't hand it over. Walking away from a bad-faith opponent isn't retreat. It's a public verdict on whether he was ever worth answering. The best proof of this rule is the reply they'll never get.",
  },
  {
    number: 6,
    title: "Devastate, then grace.",
    body: "Take the argument apart completely. Leave nothing standing. And then, from the position of total dominance, extend your hand. I say that with a smile. Have a blessed day. I'll pray for you. The grace isn't weakness and it isn't retreat. You've already won by the time you offer it. Anyone can be cruel. Anyone can be a pushover. A man who can devastate you and still wish you well is operating from a place you can't touch.",
  },
  {
    number: 7,
    title: "Their hostility feeds you.",
    body: "Every attack is a meal. They show up to take something from you, your time, your name, your peace, and you feed on it instead. The audience. The doctrine. The next chapter. Thank you for the demonstration. Your comment just paid for the next one. The prey that bites the predator only makes him stronger. The people who come to tear the work down are the ones who end up feeding it.",
  },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// The axiom sits above the rules: not a numbered rule, the premise the
// seven rest on. Rendered as a distinct, weightier framed statement
// between the hero and the rule list. Copy is the author's, verbatim.
const AXIOM = {
  eyebrow: "The Axiom",
  title: "Power decides, not righteousness.",
  body: "Every fight you've ever lost, you lost while being right. That should tell you something. The question was never what's true. It's who gets to decide what's true, and act on it. Being right is what you tell yourself in defeat. Power is what changes the outcome. Everything below is how you stop confusing the two.",
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
  let signedIn = false;
  try {
    const session = await verifySession(
      (await cookies()).get(SESSION_COOKIE)?.value
    );
    if (session?.email) {
      signedIn = true;
      // Visiting the Rules ticks that onboarding step. Cheap, and never
      // allowed to break the page.
      await markOnboardingStep(session.email, "rules");
    }
  } catch {
    // no-op
  }

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

  const fieldNotesBySlug: Record<string, FieldNoteMeta> = Object.fromEntries(
    getAllFieldNotes().map((n) => [n.slug, n])
  );

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
        <ol className="rule-list" role="list">
          {RULES.map((rule, idx) => {
            const demoNote =
              signedIn && rule.demoSlug
                ? fieldNotesBySlug[rule.demoSlug]
                : undefined;
            // Case files are the paid "practice" layer — only surface
            // them to members. Strangers see the doctrine clean.
            const demoCases = signedIn
              ? caseFilesByRule.get(rule.number) ?? []
              : [];
            return (
              <Fragment key={rule.number}>
                {idx > 0 && (
                  <li
                    aria-hidden="true"
                    className="rule-divider-li"
                  >
                    <div className="rule-divider">·</div>
                  </li>
                )}
                <li id={`rule-${rule.number}`} className="rule-card">
                  <div className="flex items-baseline gap-5 md:gap-8">
                    <span className="rule-numeral" aria-hidden="true">
                      {ROMAN[rule.number - 1]}
                    </span>
                    <div className="min-w-0 flex-1">
                      {/* Hide the visible numeral from AT and provide
                          an accessible label via the heading prefix. */}
                      <h3 className="rule-title">
                        <span className="sr-only">
                          Rule {rule.number}:
                        </span>
                        {rule.title}
                      </h3>
                      <div className="rule-body">
                        {rule.body.split(/\n\n+/).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                      {demoNote && (
                        <p className="rule-demo">
                          Demonstrated in:{" "}
                          <Link
                            href={`/notes/field-notes/${demoNote.slug}`}
                          >
                            {demoNote.title}
                          </Link>
                        </p>
                      )}
                      {/* Case files that reference this rule. Members
                          only (the paid drill layer), and omitted when
                          no case files cite it yet so early rules don't
                          render an empty block. Same .rule-demo styling
                          as the field-note demo above so the reader
                          sees one consistent "demonstrated in"
                          vocabulary. */}
                      {demoCases.length > 0 && (
                        <div className="mt-5">
                          <p
                            className="eyebrow mb-2"
                            style={{
                              fontSize: "0.62rem",
                              letterSpacing: "0.28em",
                            }}
                          >
                            Case files demonstrating this rule
                          </p>
                          <ul className="rule-demo list-none p-0 m-0 flex flex-col gap-1">
                            {demoCases.map((cf) => (
                              <li key={cf.slug}>
                                <Link href={`/case-files/${cf.slug}`}>
                                  Case File №{cf.number} &middot;{" "}
                                  {cf.title}
                                </Link>{" "}
                                &rarr;
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Rules that expand into a founding-text essay
                          get a quiet footnote pointer so a reader
                          landing on the rule can pick up the longer
                          piece. The founding essays are public, so this
                          shows for strangers too. Driven by
                          FOUNDING_LINK_BY_RULE so adding more
                          cross-links later is a one-line edit. */}
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
                            {FOUNDING_LINK_BY_RULE[rule.number].title}{" "}
                            &rarr;
                          </Link>
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ol>

        {/* Sign-off / Join CTA ===================================
            Members get the doctrine sign-off. Strangers get a "join to
            train" CTA in the same visual register as the case-file
            preview pitch — paper-deep callout, olive border, single
            link to /membership — so the funnel reads as one voice.
            The framing: the doctrine teaches, the practice is the room. */}
        {signedIn ? (
          <div className="mt-14 pt-10 border-t border-rule text-center">
            <p
              className="font-serif italic text-ink-muted leading-relaxed mb-3"
              style={{ fontSize: "1.05rem" }}
            >
              seven rules. one operator class.
            </p>
            <p
              className="font-display text-ink"
              style={{ fontSize: "1rem", fontWeight: 500 }}
            >
              stay close,
              <br />~ Clay
            </p>
          </div>
        ) : (
          <div
            className="mt-14 px-6 py-7 md:px-9 md:py-8"
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
              The doctrine is free. The practice is the room. Inside,
              every rule is drilled against a live kill in the Case
              Files, argued in the Guild, and put to work alongside
              people training the same way.
            </p>
            <p
              className="font-serif text-ink mb-5"
              style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
            >
              Plus the Writer&apos;s Desk, the Lounge, Field Notes, and
              the book in progress.
            </p>
            <p
              className="font-serif text-ink-soft mb-5"
              style={{ fontSize: "1rem", lineHeight: 1.65 }}
            >
              {founderEligible ? (
                <>
                  {founderRemaining} founder seat
                  {founderRemaining === 1 ? "" : "s"} left. $8/month
                  locked for life. When the last fills, $13 forever.
                </>
              ) : charterEligible ? (
                <>
                  {charterRemaining} charter seat
                  {charterRemaining === 1 ? "" : "s"} left. $13/month
                  floor, or pay what it&apos;s worth. Your rate locked
                  for life, with your slot number.
                </>
              ) : (
                <>
                  $13/month floor, or pay what it&apos;s worth. Locked
                  for life.
                </>
              )}
            </p>
            <p>
              <Link
                href="/membership"
                className="text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontWeight: 600 }}
              >
                Take the seat &rarr;
              </Link>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
