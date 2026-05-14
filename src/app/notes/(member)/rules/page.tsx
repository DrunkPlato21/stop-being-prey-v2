import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllFieldNotes, type FieldNoteMeta } from "@/lib/field-notes";
import { getAllCaseFiles, type CaseFile } from "@/lib/case-files";

export const metadata: Metadata = {
  title: "Rules of Engagement",
  description: "Eight rules. The doctrine behind every field note.",
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
    title: "Never enter a battle you don't have a plan to absolutely dominate.",
    body: "If you can't win the audience's reading regardless of how the opponent responds, don't engage. Pick fights you've already won before they start. The amateur looks for opponents. The operator looks for battles where the outcome is already determined.",
  },
  {
    number: 2,
    title: "The audience is the prize. The opponent is the demonstration.",
    body: "You're not arguing TO him. You're arguing FOR everyone watching. Every move serves their understanding, not his correction. The opponent is the chalkboard. The audience is the class.",
  },
  {
    number: 3,
    title: "Identify the move. Name the move. Refuse the move. Set your own frame.",
    body: "Gish gallop, reframing 101, asymmetric demand, concern troll, dead-authority projection. Every bad-faith engagement has a structure. Spot it. Name it publicly so the audience can see what's happening. Then impose YOUR frame on the conversation. Frame the conversation or be framed by it. Don't react. Lead.",
  },
  {
    number: 4,
    title: "Don't argue with people who pay no price for being wrong. Silence is a move. Walking away wins.",
    body: "Sowell's diagnostic. They have no skin in the game. Your engagement only extracts from you. Silence is the move. Walking away from a bad-faith opponent is not retreat. It's a public verdict on their seriousness. Your attention is the currency. Don't spend it on people who give nothing back.",
  },
  {
    number: 5,
    title: "Principle without power is a hobby.",
    body: "Being right doesn't win. Being effective wins. Libertarians have been right for fifty years and lost every fight because they confused moral purity with moral seriousness. Right is what you tell yourself in defeat. Winning is what changes the country. Build the leverage that lets your principles survive contact with the world. Audience. Skills. Income. Allies. Capital. Property. Operate from a position your principles can survive on, or keep losing while feeling correct.",
  },
  {
    number: 6,
    title: "Make examples, not converts.",
    body: "You don't need to change your opponent's mind. You need to demonstrate to the audience what happens when someone behaves like a predator vs. like prey. The example teaches more than the argument ever could. One real demonstration outperforms a hundred essays. Examples replicate. Arguments don't.",
  },
  {
    number: 7,
    title: "Hostility funds the work.",
    body: "Every hostile encounter is raw material. They show up to extract attention from you. You convert their attack into something they didn't intend to fund. Your audience. Your doctrine. Your reputation. Your story. The wall mechanic is this rule made literal in money, but the principle is bigger than money. Every time you handle a hostile opponent well, the audience gives you something the opponent meant to take from you. Done right, they fund the project they came to attack.",
  },
  {
    number: 8,
    title: "Discipline with love. Devastation with grace.",
    body: "Consequences must be matched by grace. Discipline without love is cruelty. Love without discipline is weakness. After you devastate an opponent, you extend grace. The Christian tradition named this most clearly, but you don't need to be Christian to deploy it. Name the harm. Make them pay the price. Then close with mercy. Grace is not retreat. You devastate completely first. Mercy comes from the position of total dominance, not in place of it. A man who can devastate and still show grace operates from a place no enemy can match.",
  },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

// Rules that expand into a founding-text essay carry a quiet
// "Read the full essay" footnote. Add new entries here as more
// founding pieces ship; the renderer picks them up automatically.
const FOUNDING_LINK_BY_RULE: Record<
  number,
  { title: string; href: string }
> = {
  5: { title: "Predator and Prey", href: "/founding/charlie-kirk" },
  8: {
    title: "We Pray For Our Prey",
    href: "/founding/we-pray-for-our-prey",
  },
};

export default function RulesPage() {
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
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
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
            Eight rules. The predator-prey doctrine of engagement.
            Memorize them. They explain every political conversation
            you&apos;ve ever lost.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <ol className="rule-list" role="list">
          {RULES.map((rule, idx) => {
            const demoNote = rule.demoSlug
              ? fieldNotesBySlug[rule.demoSlug]
              : undefined;
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
                      {/* Case files that reference this rule.
                          Omitted when no case files cite it yet so
                          early rules don't render an empty block.
                          Same .rule-demo styling as the field-note
                          demo above so the reader sees one
                          consistent "demonstrated in" vocabulary. */}
                      {(caseFilesByRule.get(rule.number) ?? []).length >
                        0 && (
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
                            {(caseFilesByRule.get(rule.number) ?? []).map(
                              (cf) => (
                                <li key={cf.slug}>
                                  <Link href={`/case-files/${cf.slug}`}>
                                    Case File №{cf.number} &middot;{" "}
                                    {cf.title}
                                  </Link>{" "}
                                  &rarr;
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                      {/* Rules that expand into a founding-text
                          essay get a quiet footnote pointer so a
                          reader landing on the rule can pick up the
                          longer piece. Driven by FOUNDING_LINK_BY_RULE
                          so adding more cross-links later is a
                          one-line edit. */}
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

        {/* Signoff */}
        <div className="mt-14 pt-10 border-t border-rule text-center">
          <p
            className="font-serif italic text-ink-muted leading-relaxed mb-3"
            style={{ fontSize: "1.05rem" }}
          >
            eight rules. one operator class.
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
