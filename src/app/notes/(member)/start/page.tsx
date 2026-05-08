import Link from "next/link";
import type { Metadata } from "next";
import { getAllArticleSlugs } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";

export const metadata: Metadata = {
  title: "Start Here",
  description:
    "Most people read political content. You're going to learn how to fight.",
};

export const dynamic = "force-dynamic";

const FOUR_DODGE_SLUG = "the-four-dodge-framework";

export default function StartHerePage() {
  const articleSlugs = new Set(getAllArticleSlugs());
  const fourDodgeExists = articleSlugs.has(FOUR_DODGE_SLUG);

  // Find the first field note (#001) so the second link in "Where to
  // start" resolves to the right slug even if the filename ever changes.
  const ascending = [...getAllFieldNotes()].sort(
    (a, b) => a.number - b.number
  );
  const firstNote = ascending[0];

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Members area · Start here
          </p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Most people read political content. You&apos;re going to
            learn how to fight.
          </h1>
        </div>
      </section>

      {/* Body */}
      <section className="max-w-2xl mx-auto px-6 py-14 md:py-20">
        <div className="prose-article">
          <p>
            Stop Being Prey is not a magazine. It&apos;s a training.
            The thing you paid for is the reps.
          </p>
          <p>
            <strong>Rules of Engagement</strong> are the doctrine. Eight
            rules. Memorize them. They explain every political
            conversation you&apos;ve ever lost.
          </p>
          <p>
            <strong>Field Notes</strong> are the reps. Real Facebook
            comments, Twitter threads, reader emails, taken apart move
            by move. The rules in action against actual opponents. You
            watch, you learn, you start doing it yourself.
          </p>
          <p>
            Read both. Rules without field notes is theory you can&apos;t
            apply. Field notes without rules is entertainment. Together,
            they&apos;re how you stop being prey.
          </p>

          <h2>Where to start</h2>
        </div>

        <ol className="flex flex-col mt-8 list-none p-0">
          <li className="py-5 border-b border-rule">
            <div className="flex items-baseline gap-4">
              <span
                className="font-display text-ink-faint shrink-0"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  fontVariantNumeric: "tabular-nums",
                  width: "1.75rem",
                }}
              >
                01
              </span>
              <div>
                {fourDodgeExists ? (
                  <Link
                    href={`/${FOUR_DODGE_SLUG}`}
                    className="block no-underline group"
                  >
                    <h3
                      className="font-display text-ink leading-tight tracking-tight mb-1 group-hover:text-eye-deep transition-colors"
                      style={{
                        fontSize: "clamp(1.2rem, 2vw, 1.4rem)",
                        fontWeight: 700,
                        letterSpacing: "-0.018em",
                      }}
                    >
                      The Four-Dodge Framework
                    </h3>
                    <p
                      className="font-serif italic text-ink-muted leading-relaxed"
                      style={{ fontSize: "0.95rem" }}
                    >
                      Read this first.
                    </p>
                  </Link>
                ) : (
                  <div>
                    <h3
                      className="font-display text-ink leading-tight tracking-tight mb-1"
                      style={{
                        fontSize: "clamp(1.2rem, 2vw, 1.4rem)",
                        fontWeight: 700,
                        letterSpacing: "-0.018em",
                        opacity: 0.7,
                      }}
                    >
                      The Four-Dodge Framework{" "}
                      <span
                        className="font-serif italic text-ink-faint"
                        style={{
                          fontSize: "0.78rem",
                          fontWeight: 400,
                          letterSpacing: "0",
                        }}
                      >
                        (coming)
                      </span>
                    </h3>
                    <p
                      className="font-serif italic text-ink-muted leading-relaxed"
                      style={{ fontSize: "0.95rem" }}
                    >
                      Read this first.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </li>

          {firstNote && (
            <li className="py-5 border-b border-rule">
              <div className="flex items-baseline gap-4">
                <span
                  className="font-display text-ink-faint shrink-0"
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    fontVariantNumeric: "tabular-nums",
                    width: "1.75rem",
                  }}
                >
                  02
                </span>
                <div>
                  <Link
                    href={`/notes/${firstNote.slug}`}
                    className="block no-underline group"
                  >
                    <h3
                      className="font-display text-ink leading-tight tracking-tight mb-1 group-hover:text-eye-deep transition-colors"
                      style={{
                        fontSize: "clamp(1.2rem, 2vw, 1.4rem)",
                        fontWeight: 700,
                        letterSpacing: "-0.018em",
                      }}
                    >
                      Field Note 001 ·{" "}
                      <span style={{ fontStyle: "italic" }}>
                        {firstNote.title}
                      </span>
                    </h3>
                    <p
                      className="font-serif italic text-ink-muted leading-relaxed"
                      style={{ fontSize: "0.95rem" }}
                    >
                      Watch the rule deployed.
                    </p>
                  </Link>
                </div>
              </div>
            </li>
          )}

          <li className="py-5">
            <div className="flex items-baseline gap-4">
              <span
                className="font-display text-ink-faint shrink-0"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  fontVariantNumeric: "tabular-nums",
                  width: "1.75rem",
                }}
              >
                03
              </span>
              <div>
                <Link
                  href="/notes"
                  className="block no-underline group"
                >
                  <h3
                    className="font-display text-ink leading-tight tracking-tight group-hover:text-eye-deep transition-colors"
                    style={{
                      fontSize: "clamp(1.2rem, 2vw, 1.4rem)",
                      fontWeight: 700,
                      letterSpacing: "-0.018em",
                    }}
                  >
                    Then keep going.
                  </h3>
                </Link>
              </div>
            </div>
          </li>
        </ol>

        {/* Signoff */}
        <div className="mt-16 pt-10 border-t border-rule">
          <p
            className="font-serif italic text-ink leading-relaxed"
            style={{ fontSize: "1.05rem" }}
          >
            See you in the work.
          </p>
          <p
            className="font-display text-ink mt-3"
            style={{ fontSize: "1.05rem", fontWeight: 500 }}
          >
            ~ Clay
          </p>
        </div>
      </section>
    </div>
  );
}
