import Link from "next/link";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";
import { AudioPill } from "@/components/AudioPill";
import {
  getAllArticles,
  getCornerstones,
  audioRuntimeMinutes,
  readingMinutes,
} from "@/lib/articles";
import { RULE_ROMAN, RULE_SHORT_LABEL } from "@/lib/case-files";

// Writing-forward homepage. The doctrine hooks; the writing is the
// centerpiece (it's the product the free email delivers); the seven-rule
// teaser drops to a free supporting flex below the writing; the capture
// sells the writing, not a gated lure (the rules are public now).
//
// Spine: thesis hero -> THE WRITING (lead essay + recent strip) -> the
// seven rules (free, funnels to /rules) -> the email capture.
//
// NOTE (placeholder copy): the hero thesis lines and the capture framing
// are first-pass, for Clay to rewrite in his voice. The rule teaser pulls
// RULE_SHORT_LABEL / RULE_ROMAN so it tracks the live rule edits and never
// drifts. The writing section is built to read as a curated front door, on
// purpose distinct from the full archive at /writing.

// The seven rules, by number. Source of truth is /rules; here we only
// surface the short labels as a teaser that funnels to the full page.
const RULE_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

export default function Home() {
  // The writing is the centerpiece: the latest cornerstone leads in the big
  // slot, the next few fill a recent strip, and the full archive (with the
  // founding "Start Here" on-ramp) lives at /writing.
  const cornerstones = getCornerstones();
  const featured = cornerstones[0] ?? getAllArticles()[0];
  const recent = cornerstones.slice(1, 4);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

  // Site-level structured data: helps Google show the site name correctly
  // and understand the publisher behind the essays' Article schema.
  const siteJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://stopbeingprey.com/#website",
        url: "https://stopbeingprey.com",
        name: "Stop Being Prey",
        description:
          "Original writing on power, politics, and the apex class.",
        publisher: { "@id": "https://stopbeingprey.com/#org" },
      },
      {
        "@type": "Organization",
        "@id": "https://stopbeingprey.com/#org",
        name: "Stop Being Prey",
        url: "https://stopbeingprey.com",
        logo: "https://stopbeingprey.com/opengraph-image.jpg",
        founder: { "@type": "Person", name: "Clay" },
      },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />

      {/* === Masthead === A thin identity line, not a manifesto. The
          wordmark lives in the global header; this just orients a stranger
          on what the site is, then hands straight off to the writing. The
          doctrine now has its own nav home (/rules), so the homepage no
          longer has to carry it up top. PLACEHOLDER COPY: Clay to sharpen. */}
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-12 md:pt-16 pb-10 md:pb-12 text-center">
          <p className="font-serif italic text-ink-muted text-lg md:text-xl leading-relaxed fade-up stagger-1">
            Original writing on power, politics, and the apex class.
          </p>
        </div>
      </section>

      {/* === The Writing === The centerpiece, and now the lead. A featured
          essay, then a compact recent strip. Built as a curated front door
          (featured treatment + 3 cards), deliberately NOT a clone of the
          full archive list at /writing — homepage says "the latest, come
          in", /writing says "everything, in order". */}
      {featured && (() => {
        const featuredAudioMin = audioRuntimeMinutes(featured);
        return (
          <section className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <p className="eyebrow mb-10 text-center">The Writing</p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 md:items-center">
              <div className={featured.leadQuote ? "md:col-span-7" : "md:col-span-12"}>
                <h2
                  className="font-display tracking-tight mb-6 leading-[1.04]"
                  style={{
                    fontSize: "clamp(2rem, 4vw, 3.25rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.022em",
                  }}
                >
                  <Link
                    href={`/${featured.slug}`}
                    className="text-ink hover:text-eye-deep transition-colors no-underline"
                  >
                    {featured.title}
                  </Link>
                </h2>
                <p className="deck mb-8 max-w-xl">{featured.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 text-xs text-ink-faint mb-8 uppercase tracking-[0.18em]">
                  <span>By Clay</span>
                  <span className="text-rule">·</span>
                  <span>{formatDate(featured.date)}</span>
                  {readingMinutes(featured) && (
                    <>
                      <span className="text-rule">·</span>
                      <span>{readingMinutes(featured)} min read</span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-8">
                  <Link href={`/${featured.slug}`} className="btn-primary">
                    <span>Read the essay</span>
                  </Link>
                  {featured.spotifyEpisodeId && featuredAudioMin && (
                    <AudioPill
                      episodeId={featured.spotifyEpisodeId}
                      minutes={featuredAudioMin}
                      href={`/${featured.slug}#listen`}
                    />
                  )}
                </div>
              </div>

              {/* Only render when the featured essay supplies its OWN
                  leadQuote — never a fallback, which would attribute another
                  essay's line to this one. No quote set = no panel. */}
              {featured.leadQuote && (
                <aside className="md:col-span-5">
                  <div className="md:sticky md:top-24">
                    <p className="eyebrow mb-4">From the essay</p>
                    <blockquote
                      className="font-display italic text-ink leading-snug border-l-2 border-eye pl-6 py-2 my-2"
                      style={{
                        fontSize: "clamp(1.75rem, 3vw, 1.95rem)",
                        fontWeight: 400,
                      }}
                    >
                      &ldquo;{featured.leadQuote}&rdquo;
                    </blockquote>
                  </div>
                </aside>
              )}
            </div>

            {/* Recent strip — the next few cornerstones as compact cards. A
                different register from the featured lead and from the
                archive list, so the page reads as a showcase, not a feed. */}
            {recent.length > 0 && (
              <div className="mt-16 md:mt-20">
                <p className="eyebrow mb-8 text-center">More</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
                  {recent.map((a) => {
                    const mins = readingMinutes(a);
                    return (
                      <Link
                        key={a.slug}
                        href={`/${a.slug}`}
                        className="group block no-underline border-t border-rule pt-5"
                      >
                        <div className="flex items-baseline gap-2.5 mb-3 text-xs uppercase tracking-[0.16em] text-ink-faint">
                          <span>{formatDate(a.date)}</span>
                          {mins != null && (
                            <>
                              <span className="text-rule">·</span>
                              <span>{mins} min</span>
                            </>
                          )}
                        </div>
                        <h3
                          className="font-display text-ink group-hover:text-eye-deep transition-colors leading-snug mb-2.5"
                          style={{
                            fontSize: "clamp(1.2rem, 2vw, 1.45rem)",
                            fontWeight: 700,
                            letterSpacing: "-0.015em",
                          }}
                        >
                          {a.title}
                        </h3>
                        <p
                          className="font-serif text-ink-muted leading-relaxed"
                          style={{ fontSize: "0.96rem" }}
                        >
                          {a.subtitle ?? a.description}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-14 text-center">
              <Link
                href="/writing"
                className="font-display uppercase tracking-[0.18em] text-sm text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontWeight: 600 }}
              >
                Read everything &rarr;
              </Link>
            </div>
          </section>
        );
      })()}

      {/* === The Doctrine: seven-rule teaser === Supporting now, below the
          writing. The rules are fully public, so this reads as a free flex
          and funnels to /rules. Labels come from RULE_SHORT_LABEL so this
          never drifts from the canonical rule copy. */}
      <section className="border-y border-rule py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="eyebrow mb-4 text-center">The Doctrine</p>
          <h2
            className="font-display text-ink text-center tracking-tight leading-[1.05] mb-5"
            style={{
              fontSize: "clamp(1.9rem, 4vw, 3rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            You keep losing fights you were right about.
          </h2>
          <p className="deck text-center max-w-xl mx-auto mb-10">
            Being right was never the contest. Power was. Seven rules for
            everyone tired of being prey. All of them free.
          </p>
          <ol className="flex flex-col">
            {RULE_NUMBERS.map((n, idx) => (
              <li
                key={n}
                className={idx > 0 ? "border-t border-rule" : undefined}
              >
                <Link
                  href={`/rules#rule-${n}`}
                  className="group flex items-baseline gap-4 md:gap-6 py-4 no-underline"
                >
                  <span
                    className="font-display text-eye-deep shrink-0"
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      minWidth: "2.25rem",
                    }}
                  >
                    {RULE_ROMAN[n - 1]}
                  </span>
                  <span
                    className="font-display text-ink group-hover:text-eye-deep transition-colors leading-snug"
                    style={{
                      fontSize: "clamp(1.15rem, 2.5vw, 1.4rem)",
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {RULE_SHORT_LABEL[n]}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Link href="/rules" className="btn-primary">
              <span>Read the rules</span>
            </Link>
          </div>
        </div>
      </section>

      {/* === The email capture === Sells the WRITING now, not a gated lure
          (the rules are public). The free email IS the daily writing; the
          rules are the on-ramp link. The Kit form delivers the welcome. */}
      <section
        id="join"
        className="bg-paper-deep border-t border-rule py-14 md:py-20"
      >
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="eyebrow mb-5">Free</p>
          <h2
            className="font-display tracking-tight mb-6 leading-[1.05]"
            style={{
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Get the writing.
          </h2>
          <p className="deck max-w-xl mx-auto mb-10">
            I write nearly every day. The doctrine put to work, the latest
            fights, all of it free in your inbox. New here?{" "}
            <Link
              href="/rules"
              className="text-eye-deep hover:text-ink"
              style={{
                textDecoration: "underline",
                textDecorationColor: "var(--eye)",
                textUnderlineOffset: "3px",
              }}
            >
              Start with the 7 Rules
            </Link>
            .
          </p>
          <DualSubscribeBlock />
          <p className="text-xs italic text-ink-faint mt-8 text-center">
            Unsubscribe anytime.
          </p>
        </div>
      </section>
    </div>
  );
}
