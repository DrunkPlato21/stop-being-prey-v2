import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getAllCaseFiles,
  RULE_ROMAN,
  RULE_SHORT_LABEL,
  teaseOneShot,
} from "@/lib/case-files";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { markNavViewed } from "@/lib/nav-dots";

export const metadata: Metadata = {
  title: "Case Files",
  description:
    "Real arguments, dissected. Deployable responses, drilled.",
};

export const dynamic = "force-dynamic";

function formatDate(date: string): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Case Files landing. No cases exist yet on launch day, but the
// section is intentional architecture: members need to understand
// the doctrine shape from day one. Three panels stacked beneath the
// header:
//   1. Intro: what a Case File is, set against Rules of Engagement.
//   2. Empty state + submission CTA → Writer's Desk note intake.
//   3. Template preview ("What a Case File looks like"), a visual
//      schema so members understand the format before content lands.

const TEMPLATE_SECTIONS: Array<{
  label: string;
  blurb: string;
}> = [
  {
    label: "The Situation",
    blurb:
      "The encounter, set up in one paragraph. Who, where, what was being argued.",
  },
  {
    label: "The Move",
    blurb:
      "What the opponent did, named precisely. Gish gallop, frame trap, asymmetric demand, concern troll.",
  },
  {
    label: "The Trap",
    blurb:
      "Why the standard response loses. The instinctive counter that walks straight into the move.",
  },
  {
    label: "The Frame Shift",
    blurb:
      "The reframe that wins the audience without taking the bait. How the operator refuses the move and imposes their own ground.",
  },
];

export default async function CaseFilesPage() {
  const cases = getAllCaseFiles();

  // Clear the "new case file" nav dot for this viewer. Fire-and-forget
  // — degrading to a stale dot on a Redis hiccup is acceptable.
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  if (session?.email) {
    await markNavViewed("case-files", session.email).catch(() => null);
  }

  return (
    <div className="rules-paper">
      {/* === Header === */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Case Files.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Real arguments, dissected. Deployable responses, drilled.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        {/* === Intro panel === */}
        <div
          className="px-7 py-9 md:px-10 md:py-11 border border-rule"
          style={{ background: "var(--paper-deep)" }}
        >
          <p
            className="font-serif text-ink leading-relaxed mb-5"
            style={{ fontSize: "1.05rem" }}
          >
            Case Files are real comment-section battles, dissected
            publicly. A member sends in something they faced. A hostile
            commenter, a bad-faith argument, a frame trap. Clay walks
            through what move the opponent used, why the standard
            response loses, and what to do instead.
          </p>
          <p
            className="font-serif text-ink leading-relaxed mb-5"
            style={{ fontSize: "1.05rem" }}
          >
            Each Case File ends with a one-shot. The actual line you
            can deploy when you face the same move yourself. The
            dissection teaches the framework. The one-shot teaches the
            deployment.
          </p>
          <p
            className="font-serif italic text-ink-muted leading-relaxed"
            style={{ fontSize: "1.02rem" }}
          >
            Where the{" "}
            <Link
              href="/rules"
              className="text-eye-deep hover:text-ink"
              style={{
                textDecoration: "underline",
                textDecorationColor: "var(--rule)",
                textUnderlineOffset: "3px",
              }}
            >
              Rules of Engagement
            </Link>{" "}
            are the doctrine, Case Files are the drills.
          </p>
        </div>

        {/* === The shelf =========================================
            Card grid, newest case file first. Each card carries
            number eyebrow + title + archetype chip + one-shot
            teaser + applied-rule chips. Card-as-link so the whole
            tile is the affordance, not just the title. */}
        <div className="mt-14">
          <p
            className="eyebrow mb-4"
            style={{ fontSize: "0.68rem", letterSpacing: "0.32em" }}
          >
            The shelf
          </p>
          {cases.length === 0 ? (
            <div
              className="px-7 py-10 md:px-10 md:py-12 border border-rule text-center"
              style={{ background: "var(--paper-deep)" }}
            >
              <p
                className="font-display text-ink leading-snug mb-3"
                style={{
                  fontSize: "clamp(1.35rem, 2.4vw, 1.6rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                }}
              >
                First Case File publishing soon.
              </p>
              <p
                className="font-serif italic text-ink-muted leading-relaxed max-w-md mx-auto"
                style={{ fontSize: "1rem" }}
              >
                The pipeline opens with member submissions.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-5 list-none p-0 m-0">
              {cases.map((cf) => (
                <li key={cf.slug}>
                  <Link
                    href={`/case-files/${cf.slug}`}
                    className="case-card no-underline block h-full"
                  >
                    <p
                      className="eyebrow mb-3"
                      style={{ fontSize: "0.66rem" }}
                    >
                      Case File №{cf.number}
                      {cf.date && (
                        <>
                          {" · "}
                          {formatDate(cf.date)}
                        </>
                      )}
                    </p>
                    <h3
                      className="font-display text-ink leading-tight tracking-tight mb-3"
                      style={{
                        fontSize: "clamp(1.35rem, 2.4vw, 1.65rem)",
                        fontWeight: 700,
                        letterSpacing: "-0.018em",
                      }}
                    >
                      {cf.title}
                    </h3>
                    {/* Archetype chip — same outlined-olive register
                        as the tier badges so it reads as a
                        classifier, not a button. */}
                    <div className="mb-4">
                      <span className="member-chip">
                        {cf.archetype}
                      </span>
                    </div>
                    <p
                      className="font-serif italic text-ink-muted leading-relaxed mb-5"
                      style={{ fontSize: "0.98rem" }}
                    >
                      &ldquo;{teaseOneShot(cf.oneShot)}&rdquo;
                    </p>
                    {cf.rulesApplied.length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-2 items-center">
                        {cf.rulesApplied.map((n) => (
                          <span
                            key={n}
                            className="font-display uppercase tracking-[0.22em] text-eye-deep"
                            style={{
                              fontSize: "0.62rem",
                              fontWeight: 600,
                            }}
                          >
                            Rule {RULE_ROMAN[n - 1]}{" "}
                            <span
                              className="font-serif italic text-ink-muted"
                              style={{
                                fontSize: "0.85rem",
                                letterSpacing: 0,
                                textTransform: "none",
                                fontWeight: 400,
                              }}
                            >
                              {RULE_SHORT_LABEL[n]}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* === Submit a case: three tiers ===
            Free flows through the existing Writer's Desk leave-a-note
            intake. Public and Private are paid (Stripe checkout) and
            guaranteed within 5 business days. */}
        <div className="mt-14">
          <p
            className="eyebrow mb-4"
            style={{ fontSize: "0.68rem", letterSpacing: "0.32em" }}
          >
            Submit a case
          </p>
          <p
            className="font-serif italic text-ink-muted mb-7"
            style={{ fontSize: "0.98rem" }}
          >
            Three ways in. Free for public surfacing, paid tiers for
            guaranteed turnaround.
          </p>

          {/* Three tier cards. Stack until lg (1024px) so the cards
              always have room to breathe when they go side-by-side.
              At lg+, the row breaks out of the parent's max-w-3xl
              with negative margins so each card lands at a proper
              reading width instead of cramming into ~220px.

              Magazine-style header: tier name as eyebrow on line 1,
              price as serif accent on line 2. min-height on the
              header keeps the three of them vertically aligned so
              the description blocks start at the same Y position. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 lg:-mx-12 xl:-mx-20">
            {/* Free */}
            <article
              className="relative flex flex-col"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--eye-deep)",
                padding: "2.25rem 1.85rem",
              }}
            >
              <header
                className="mb-6"
                style={{ minHeight: "3.4rem" }}
              >
                <p
                  className="eyebrow"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.28em" }}
                >
                  Free
                </p>
              </header>
              <p
                className="font-serif text-ink flex-1 mb-7"
                style={{ fontSize: "0.97rem", lineHeight: 1.5 }}
              >
                Drop your case publicly. Best ones become Case Files.
                No guaranteed review.
              </p>
              <Link href="/case-files/submit" className="cta-prestige">
                <span>Submit case</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </article>

            {/* Public Review, coming soon for Friday launch */}
            <article
              className="relative flex flex-col"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--eye-deep)",
                padding: "2.25rem 1.85rem",
                opacity: 0.6,
              }}
            >
              <span
                aria-label="Coming soon"
                className="font-display uppercase"
                style={{
                  position: "absolute",
                  top: "0.85rem",
                  right: "1rem",
                  fontSize: "0.55rem",
                  letterSpacing: "0.28em",
                  fontWeight: 600,
                  color: "var(--eye-deep)",
                }}
              >
                Coming soon
              </span>
              <header
                className="mb-6"
                style={{ minHeight: "3.4rem" }}
              >
                <p
                  className="eyebrow"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.28em" }}
                >
                  Public Review
                </p>
                <p
                  className="font-display text-eye-deep"
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    letterSpacing: "-0.005em",
                    marginTop: "0.4rem",
                    lineHeight: 1,
                  }}
                >
                  $25
                </p>
              </header>
              <p
                className="font-serif text-ink flex-1 mb-7"
                style={{ fontSize: "0.97rem", lineHeight: 1.5 }}
              >
                Guaranteed dissection within 2 business days. Becomes
                a public Case File. You choose anonymization level.
              </p>
              <span
                role="button"
                aria-disabled="true"
                tabIndex={-1}
                className="cta-prestige-disabled"
              >
                Coming Soon
              </span>
            </article>

            {/* Private Review, coming soon for Friday launch */}
            <article
              className="relative flex flex-col"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--eye-deep)",
                padding: "2.25rem 1.85rem",
                opacity: 0.6,
              }}
            >
              <span
                aria-label="Coming soon"
                className="font-display uppercase"
                style={{
                  position: "absolute",
                  top: "0.85rem",
                  right: "1rem",
                  fontSize: "0.55rem",
                  letterSpacing: "0.28em",
                  fontWeight: 600,
                  color: "var(--eye-deep)",
                }}
              >
                Coming soon
              </span>
              <header
                className="mb-6"
                style={{ minHeight: "3.4rem" }}
              >
                <p
                  className="eyebrow"
                  style={{ fontSize: "0.7rem", letterSpacing: "0.28em" }}
                >
                  Private Review
                </p>
                <p
                  className="font-display text-eye-deep"
                  style={{
                    fontSize: "1.35rem",
                    fontWeight: 700,
                    letterSpacing: "-0.005em",
                    marginTop: "0.4rem",
                    lineHeight: 1,
                  }}
                >
                  $50
                </p>
              </header>
              <p
                className="font-serif text-ink flex-1 mb-7"
                style={{ fontSize: "0.97rem", lineHeight: 1.5 }}
              >
                Guaranteed dissection within 2 business days. Stays
                private, just for you.
              </p>
              <span
                role="button"
                aria-disabled="true"
                tabIndex={-1}
                className="cta-prestige-disabled"
              >
                Coming Soon
              </span>
            </article>
          </div>
        </div>

        {/* === Template preview ===
            Visual schema, not actual content. Renders the six labeled
            sections members will see when cases start publishing.
            The One-Shot gets an eye-deep callout treatment to signal
            the deployable line; Rules Applied gets the same link
            styling as .rule-demo. */}
        <div className="mt-16">
          <p
            className="eyebrow mb-4"
            style={{ fontSize: "0.68rem", letterSpacing: "0.32em" }}
          >
            The format
          </p>
          <h2
            className="font-display text-ink leading-snug tracking-tight mb-6"
            style={{
              fontSize: "clamp(1.5rem, 2.8vw, 1.85rem)",
              fontWeight: 700,
              letterSpacing: "-0.018em",
            }}
          >
            What a Case File looks like.
          </h2>
          <p
            className="font-serif italic text-ink-muted leading-relaxed mb-7"
            style={{ fontSize: "0.98rem" }}
          >
            The shape every case follows. Lets you read one fast and
            re-deploy it faster.
          </p>

          <div
            className="px-7 py-9 md:px-10 md:py-11 border border-rule"
            style={{ background: "var(--paper-deep)" }}
          >
            <ol className="flex flex-col gap-7 list-none p-0 m-0">
              {TEMPLATE_SECTIONS.map((section) => (
                <li key={section.label}>
                  <p
                    className="eyebrow mb-2"
                    style={{ fontSize: "0.64rem" }}
                  >
                    {section.label}
                  </p>
                  <p
                    className="font-serif italic text-ink-muted leading-relaxed"
                    style={{ fontSize: "0.98rem" }}
                  >
                    {section.blurb}
                  </p>
                </li>
              ))}

              {/* One-shot: highlighted callout. The line you'd
                  actually deploy. */}
              <li
                className="px-5 py-5 md:px-6 md:py-6"
                style={{
                  background: "var(--paper)",
                  borderLeft: "2px solid var(--eye-deep)",
                }}
              >
                <p
                  className="eyebrow mb-2"
                  style={{ fontSize: "0.64rem" }}
                >
                  The One-Shot
                </p>
                <p
                  className="font-display text-ink leading-snug"
                  style={{
                    fontSize: "1.18rem",
                    fontWeight: 500,
                    fontStyle: "italic",
                    letterSpacing: "-0.005em",
                  }}
                >
                  &ldquo;The deployable line lives here. Short,
                  memorable, repeatable. The drill you carry into the
                  next encounter.&rdquo;
                </p>
              </li>

              {/* Rules Applied: mirrors the .rule-demo treatment
                  from the Rules of Engagement page so members
                  recognize the link vocabulary. */}
              <li>
                <p
                  className="eyebrow mb-2"
                  style={{ fontSize: "0.64rem" }}
                >
                  Rules Applied
                </p>
                <p className="rule-demo" style={{ margin: 0 }}>
                  <Link href="/rules#rule-3">
                    Rule III &middot; Identify the move
                  </Link>
                  {"  ·  "}
                  <Link href="/rules#rule-6">
                    Rule VI &middot; Make examples
                  </Link>
                </p>
              </li>
            </ol>
          </div>
        </div>

        {/* Signoff: matches the Rules of Engagement bottom note. */}
        <div className="mt-14 pt-10 border-t border-rule text-center">
          <p
            className="font-serif italic text-ink-muted leading-relaxed mb-3"
            style={{ fontSize: "1.05rem" }}
          >
            the doctrine teaches. the case files drill.
          </p>
          <p
            className="font-display text-ink"
            style={{ fontSize: "1rem", fontWeight: 500 }}
          >
            stay close,
            <br />~ Clay
          </p>
        </div>
      </section>
    </div>
  );
}
