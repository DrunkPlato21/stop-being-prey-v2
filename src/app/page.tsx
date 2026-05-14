import Link from "next/link";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";
import { EyeDivider } from "@/components/Eyes";
import { AudioPill } from "@/components/AudioPill";
import { getAllArticles } from "@/lib/articles";
import { getCurrentIssue } from "@/lib/issue";

export default function Home() {
  const articles = getAllArticles();
  // The lead is the highest-numbered issue. Non-issue essays never take the
  // hero slot; they live at their own URL but are not listed here.
  const issues = articles
    .filter((a) => typeof a.issue === "number")
    .sort((a, b) => (b.issue ?? 0) - (a.issue ?? 0));
  const featured = issues[0] ?? articles[0];
  const previousIssues = issues.filter((a) => a.slug !== featured?.slug);
  const issue = getCurrentIssue(featured ? [featured] : articles);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div>
      {/* === Start Here hero ============================================
           On-ramp for first-time visitors. Two equal-weight cards point
           to the founding texts of the publication — the on-ramp into
           the doctrine before the reader hits the issue feed. Sits
           above everything else so a brand-new visitor lands on it
           first; returning readers scroll past it to the latest
           issue. */}
      <section>
        <div className="max-w-6xl mx-auto px-6 pt-12 md:pt-16 pb-10 md:pb-14">
          <div className="text-center mb-10 md:mb-12">
            <p className="eyebrow mb-3 fade-up stagger-1">Start here</p>
            <p
              className="font-serif italic text-ink-muted fade-up stagger-2"
              style={{ fontSize: "1.05rem" }}
            >
              The two founding pieces of Stop Being Prey.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
            <FoundingCard
              href="/founding/charlie-kirk"
              title="Predator and Prey"
              description="The founding text. What Charlie Kirk's life taught the operator class about who hunts and who gets hunted."
            />
            <FoundingCard
              href="/founding/we-pray-for-our-prey"
              title="We Pray For Our Prey"
              description="The grace dimension of the doctrine. The operator class doesn't celebrate the kill, it carries the weight."
            />
          </div>
        </div>
      </section>

      {/* === Masthead === */}
      <section>
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 border-t border-b border-rule">
          <div className="flex flex-col items-center text-center">
            {issue && (
              <p className="eyebrow mb-7 fade-up">
                Vol. {issue.volume} · No. {issue.number} ·{" "}
                <span className="sm:hidden">{issue.shortDateLabel}</span>
                <span className="hidden sm:inline">{issue.dateLabel}</span>
              </p>
            )}
            <h1
              className="font-display text-ink leading-[0.95] tracking-tight fade-up stagger-2"
              style={{
                fontSize: "clamp(3.5rem, 10vw, 6rem)",
                fontWeight: 700,
                letterSpacing: "-0.025em",
              }}
            >
              Stop Being Prey
            </h1>
            <p
              className="font-serif italic text-ink-muted text-lg md:text-xl mt-6 max-w-2xl leading-relaxed fade-up stagger-3"
              style={{ fontWeight: 400 }}
            >
              On power, politics, and the apex class. Letters and audio
              by Clay.
            </p>
          </div>
        </div>
      </section>

      {/* === Featured Lead Article === */}
      {featured && (() => {
        const featuredAudioMin = featured.wordCount
          ? Math.round(featured.wordCount / 150)
          : null;
        // The masthead above already carries the volume / issue / date
        // line, so the lead card's eyebrow names the *role* of this slot
        // (it's the featured essay of the current issue) rather than
        // restating the issue number.
        const leadEyebrow =
          typeof featured.issue === "number" ? "The Lead" : "Latest";
        return (
          <section className="max-w-6xl mx-auto px-6 py-10 md:py-16">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 md:items-center">
              <div className="md:col-span-7">
                <p className="eyebrow mb-5">{leadEyebrow}</p>
                <h2
                  className="font-display tracking-tight mb-6 leading-[1.04]"
                  style={{
                    fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)",
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
                    &ldquo;We can model them. They can&apos;t model us.&rdquo;
                  </blockquote>
                  {featured.spotifyEpisodeId && (
                    <div className="mt-6 text-right">
                      <Link
                        href="/podcast"
                        className="eyebrow no-underline hover:text-ink transition-colors"
                      >
                        All episodes →
                      </Link>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </section>
        );
      })()}

      {previousIssues.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-10 md:py-14">
          <p className="eyebrow mb-10 text-center">Previous issues</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {previousIssues.map((article) => (
              <Link
                key={article.slug}
                href={`/${article.slug}`}
                className="block border border-rule p-6 md:p-8 no-underline transition-colors hover:border-eye"
              >
                <p className="eyebrow mb-3">
                  Issue No. {article.issue} · {formatDate(article.date)}
                </p>
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
          <div className="mt-10 text-center">
            <Link
              href="/issues"
              className="eyebrow no-underline hover:text-ink transition-colors"
            >
              All issues →
            </Link>
          </div>
        </section>
      )}

      {/* === Manifesto strip === */}
      <section className="bg-paper-deep border-y border-rule py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="eyebrow mb-8">The work</p>
          <p
            className="font-display text-ink leading-tight mb-8"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              fontWeight: 400,
            }}
          >
            <em className="italic">Stop Being Prey</em> is a publication
            on politics, power, and the apex class.
          </p>
          <p className="deck mb-8 max-w-2xl mx-auto">
            A continuing inquiry into who the real predators are, who lets
            them stay predators, and what it takes to stop being their prey.
          </p>
          <p className="text-sm italic text-ink-faint">
            Written and narrated by Clay.{" "}
            <Link
              href="/tip"
              className="text-ink-faint hover:text-eye-deep transition-colors no-underline"
            >
              Reader-supported.
            </Link>
          </p>
        </div>
      </section>

      {/* === Subscribe === */}
      <section
        id="join"
        className="max-w-3xl mx-auto px-6 py-12 md:py-16 text-center"
      >
        <p className="eyebrow mb-5">Subscribe</p>
        <h2
          className="font-display tracking-tight mb-10 leading-[1.05]"
          style={{
            fontSize: "clamp(2rem, 4vw, 3.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Get the next one.
        </h2>
        <DualSubscribeBlock />
        <p className="text-xs italic text-ink-faint mt-8 text-center">
          Unsubscribe anytime. We never share your email.
        </p>
      </section>
    </div>
  );
}

// === Founding-text card =========================================
// Used in the "Start here" hero. Equal visual weight — both cards
// are foundational; neither is "primary." Card surface is a thin
// olive rule on paper-deep, hover lifts the rule + brightens the
// title. Title in display serif, description in body serif, olive
// "Read →" affordance at the bottom.
function FoundingCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="founding-card group no-underline flex flex-col"
    >
      <h2
        className="font-display text-ink leading-[1.1] mb-3"
        style={{
          fontSize: "clamp(1.5rem, 2.6vw, 1.85rem)",
          fontWeight: 700,
          letterSpacing: "-0.018em",
        }}
      >
        {title}
      </h2>
      <p
        className="font-serif text-ink-muted leading-relaxed mb-5 flex-1"
        style={{ fontSize: "1rem" }}
      >
        {description}
      </p>
      <span
        className="font-display uppercase tracking-[0.22em] text-eye-deep"
        style={{ fontSize: "0.7rem", fontWeight: 600 }}
      >
        Read &rarr;
      </span>
    </Link>
  );
}
