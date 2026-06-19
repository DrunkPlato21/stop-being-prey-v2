import Link from "next/link";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";
import { AudioPill } from "@/components/AudioPill";
import {
  getAllArticles,
  getCornerstones,
  getDispatches,
  audioRuntimeMinutes,
} from "@/lib/articles";
import { RULE_ROMAN, RULE_SHORT_LABEL } from "@/lib/case-files";

// Doctrine-first homepage. A stranger should meet the doctrine, not a
// magazine masthead. The spine: thesis hero -> the seven rules (funnel
// to the free /rules) -> essays as proof -> the Rules email magnet.
//
// NOTE (placeholder copy): the hero thesis lines and the magnet framing
// are first-pass and meant for Clay to rewrite in his voice. The rule
// teaser pulls RULE_SHORT_LABEL / RULE_ROMAN so it tracks the live rule
// edits automatically and never drifts.

// The seven rules, by number. Source of truth is /rules; here we only
// surface the short labels as a teaser that funnels to the full page.
const RULE_NUMBERS = [1, 2, 3, 4, 5, 6, 7];

export default function Home() {
  // Two tempos. Cornerstones (major essays) lead the proof section; the
  // latest one takes the big slot. Dispatches (the shorter, frequent
  // pieces) run as a stream below - the pulse that gives a reason to
  // return between the big drops.
  const cornerstones = getCornerstones();
  const featured = cornerstones[0] ?? getAllArticles()[0];
  const otherCornerstones = cornerstones.filter(
    (a) => a.slug !== featured?.slug
  );
  const dispatches = getDispatches().slice(0, 5);

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

      {/* === Thesis hero === PLACEHOLDER COPY: Clay to rewrite. The
          stranger meets the doctrine here, not a masthead. The wordmark
          already lives in the global header, so the hero leads with the
          claim. */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-14 md:pb-20 text-center">
          <p className="eyebrow mb-7 fade-up stagger-1">
            The predator-prey doctrine
          </p>
          <h1
            className="font-display text-ink leading-[1.02] tracking-tight fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 7vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            You keep losing fights
            <br className="hidden sm:block" /> you were right about.
          </h1>
          <p
            className="font-serif text-ink-muted text-lg md:text-xl mt-7 max-w-2xl mx-auto leading-relaxed fade-up stagger-3"
            style={{ fontWeight: 400 }}
          >
            Being right was never the contest. Power was. Seven rules
            for everyone tired of being the prey. Start with rule one.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 fade-up stagger-4">
            <Link href="/rules" className="btn-primary">
              <span>Read the 7 Rules</span>
            </Link>
            <Link href="/membership" className="btn-secondary">
              Join the room
            </Link>
          </div>
        </div>
      </section>

      {/* === The Doctrine: seven-rule teaser === Funnels to the free
          /rules page. Labels come from RULE_SHORT_LABEL so this never
          drifts from the canonical rule copy. */}
      <section className="bg-paper-deep border-b border-rule py-14 md:py-20">
        <div className="max-w-3xl mx-auto px-6">
          <p className="eyebrow mb-3 text-center">The Doctrine</p>
          <p className="deck text-center max-w-xl mx-auto mb-10">
            Power decides, not righteousness. Everything below is how you
            stop confusing the two.
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
              <span>Read all seven</span>
            </Link>
          </div>
        </div>
      </section>

      {/* === Seen in practice: essays as proof === The literature that
          teaches the rules through real engagements. The lead essay,
          then the archive. */}
      {featured && (() => {
        const featuredAudioMin = audioRuntimeMinutes(featured);
        return (
          <section className="max-w-6xl mx-auto px-6 py-12 md:py-16">
            <p className="eyebrow mb-10 text-center">Seen in practice</p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 md:items-center">
              <div className="md:col-span-7">
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
                  {featured.wordCount && (
                    <>
                      <span className="text-rule">·</span>
                      <span>
                        {featured.wordCount.toLocaleString("en-US")} words
                      </span>
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
                    />
                  )}
                </div>
              </div>

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
                    &ldquo;
                    {featured.leadQuote ??
                      "We can model them. They can't model us."}
                    &rdquo;
                  </blockquote>
                </div>
              </aside>
            </div>
          </section>
        );
      })()}

      {otherCornerstones.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-12 md:pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {otherCornerstones.map((article) => (
              <Link
                key={article.slug}
                href={`/${article.slug}`}
                className="block border border-rule p-6 md:p-8 no-underline transition-colors hover:border-eye"
              >
                <p className="eyebrow mb-3">{formatDate(article.date)}</p>
                <h3
                  className="font-display text-ink text-2xl md:text-3xl mb-3 leading-tight tracking-tight"
                  style={{ fontWeight: 700, letterSpacing: "-0.02em" }}
                >
                  {article.title}
                </h3>
                <p className="text-ink-muted text-sm italic leading-relaxed">
                  {article.subtitle ?? article.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* === Dispatches: the pulse === The shorter, more frequent pieces.
          A reason to check back between the big essays. PLACEHOLDER label
          ("Dispatches") - Clay to name. */}
      {dispatches.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 pb-14 md:pb-20">
          <p className="eyebrow mb-8 text-center">Dispatches</p>
          <ul className="flex flex-col">
            {dispatches.map((article, idx) => (
              <li
                key={article.slug}
                className={idx > 0 ? "border-t border-rule" : undefined}
              >
                <Link
                  href={`/${article.slug}`}
                  className="group flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-6 py-4 no-underline"
                >
                  <span
                    className="font-display text-ink group-hover:text-eye-deep transition-colors leading-snug"
                    style={{ fontSize: "1.2rem", fontWeight: 600 }}
                  >
                    {article.title}
                  </span>
                  <span className="eyebrow shrink-0 whitespace-nowrap">
                    {formatDate(article.date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-8 text-center">
            <Link
              href="/issues"
              className="eyebrow no-underline hover:text-ink transition-colors"
            >
              All writing →
            </Link>
          </div>
        </section>
      )}

      {/* === The Rules email magnet === PLACEHOLDER framing: Clay to
          finalize. The Rules are free to read at /rules; this captures
          the email. NOTE: actually delivering the Rules by email on
          signup is the separate "Rules as the email magnet" task. */}
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
            Get the Rules of Engagement.
          </h2>
          <p className="deck max-w-xl mx-auto mb-10">
            The whole doctrine, free.{" "}
            <Link
              href="/rules"
              className="text-eye-deep hover:text-ink"
              style={{
                textDecoration: "underline",
                textDecorationColor: "var(--eye)",
                textUnderlineOffset: "3px",
              }}
            >
              Read them now
            </Link>
            , or get them in your inbox with every new dispatch.
          </p>
          <DualSubscribeBlock />
          <p className="text-xs italic text-ink-faint mt-8 text-center">
            Unsubscribe anytime. We never share your email.
          </p>
        </div>
      </section>
    </div>
  );
}
