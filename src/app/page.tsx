import Link from "next/link";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import { SpotifyEmbed } from "@/components/SpotifyEmbed";
import { getAllArticles } from "@/lib/articles";
import { getCurrentIssue } from "@/lib/issue";

const FOUNDATIONAL_SLUG = "the-losertarian-problem";

export default function Home() {
  const articles = getAllArticles();
  const featured = articles[0];
  const olderArticles = articles.slice(1);
  const issue = getCurrentIssue(articles);
  const foundational = articles.find((a) => a.slug === FOUNDATIONAL_SLUG);
  const showFoundational =
    !!foundational && articles.length > 1 && featured?.slug !== FOUNDATIONAL_SLUG;

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div>
      {/* === Masthead === */}
      <section>
        <div className="max-w-6xl mx-auto px-6 py-16 border-t border-b border-rule">
          <div className="flex flex-col items-center text-center">
            {issue && (
              <p className="eyebrow mb-7 fade-up">
                <span className="block sm:inline">
                  Vol. {issue.volume} · No. {issue.number}
                </span>
                <span className="hidden sm:inline"> · </span>
                <span className="block sm:inline">{issue.dateLabel}</span>
              </p>
            )}
            <h1
              className="font-display text-ink leading-[0.95] tracking-tight fade-up stagger-2"
              style={{
                fontSize: "clamp(3rem, 8vw, 6rem)",
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
              On power, politics, and the apex class. Daily letters and audio
              by Clay.
            </p>
          </div>
        </div>
      </section>

      {/* === Featured Lead Article === */}
      {featured && (
        <section className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-16 md:items-center">
            <div className="md:col-span-7">
              <p className="eyebrow mb-5">
                {featured.chapter
                  ? `Lead Essay · Chapter ${featured.chapter}`
                  : "Lead Essay"}
              </p>
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-faint mb-8 uppercase tracking-[0.18em]">
                <span>By Clay</span>
                <span className="text-rule">·</span>
                <span>{formatDate(featured.date)}</span>
                {featured.wordCount && (
                  <>
                    <span className="text-rule">·</span>
                    <span>{featured.wordCount.toLocaleString()} words</span>
                  </>
                )}
                {featured.spotifyEpisodeId && (
                  <>
                    <span className="text-rule">·</span>
                    <span>~{Math.round((featured.wordCount || 6000) / 150)} min audio</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/${featured.slug}`} className="btn-primary">
                  <span>Read the essay</span>
                </Link>
              </div>
            </div>

            <aside className="md:col-span-5">
              <div className="md:sticky md:top-24 space-y-6">
                {featured.spotifyEpisodeId && (
                  <div>
                    <SpotifyEmbed
                      episodeId={featured.spotifyEpisodeId}
                      type="episode"
                      size="standard"
                    />
                    <div className="mt-3 text-right">
                      <Link
                        href="/podcast"
                        className="eyebrow no-underline hover:text-ink transition-colors"
                      >
                        All episodes →
                      </Link>
                    </div>
                  </div>
                )}
                <div className="mt-10">
                  <p className="eyebrow mb-4">From the essay</p>
                  <blockquote
                    className="font-display italic text-ink leading-snug border-l-2 border-eye pl-6 py-2 my-2"
                    style={{
                      fontSize: "clamp(1.45rem, 2.2vw, 1.75rem)",
                      fontWeight: 400,
                    }}
                  >
                    &ldquo;Power is what makes ideas matter. Without power, you
                    don&apos;t have ideas. You have a hobby.&rdquo;
                  </blockquote>
                </div>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* === Foundational Essay (permanent, hidden when only one essay exists) === */}
      {showFoundational && foundational && (
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="bg-surface border border-ink/10 p-8 md:p-12 relative max-w-4xl mx-auto">
            {/* Cat-eye corner ornaments */}
            <span className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-eye" />
            <span className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-eye" />
            <span className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-eye" />
            <span className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-eye" />

            <p className="eyebrow mb-4">Chapter 1</p>
            <h2
              className="font-display tracking-tight mb-4 leading-[1.05]"
              style={{
                fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              <Link
                href={`/${foundational.slug}`}
                className="text-ink hover:text-eye-deep transition-colors no-underline"
              >
                {foundational.title}
              </Link>
            </h2>
            <p className="deck mb-6 max-w-xl">{foundational.description}</p>
            <Link
              href={`/${foundational.slug}`}
              className="font-display text-sm uppercase tracking-[0.18em] text-ink hover:text-eye-deep transition-colors no-underline"
              style={{ fontWeight: 500 }}
            >
              Read the essay →
            </Link>
          </div>
        </section>
      )}

      <EyeDivider />

      {olderArticles.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 py-12 md:py-16">
          <p className="eyebrow mb-10 text-center">More essays</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            {olderArticles.map((article) => (
              <article key={article.slug}>
                <p className="text-xs uppercase tracking-[0.18em] text-ink-faint mb-2">
                  {formatDate(article.date)}
                </p>
                <h3
                  className="font-display text-2xl mb-3 leading-tight tracking-tight"
                  style={{ fontWeight: 700 }}
                >
                  <Link
                    href={`/${article.slug}`}
                    className="text-ink hover:text-eye-deep no-underline"
                  >
                    {article.title}
                  </Link>
                </h3>
                <p className="text-ink-muted text-sm italic leading-relaxed">
                  {article.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* === Manifesto strip === */}
      <section className="bg-paper-deep border-y border-rule py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="eyebrow mb-6">The work</p>
          <p
            className="font-display text-ink leading-tight mb-12"
            style={{
              fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
              fontWeight: 400,
            }}
          >
            <em className="italic">Stop Being Prey</em> is a daily letter, a
            podcast, a community, and a forthcoming book on politics, power,
            and the apex class. Written and read aloud by Clay.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-left max-w-2xl mx-auto">
            <div>
              <p className="eyebrow mb-2">Daily</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                A letter every morning. Free. Direct to your inbox.
              </p>
            </div>
            <div>
              <p className="eyebrow mb-2">Audio</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The podcast reads each piece aloud. Most days. On Spotify.
              </p>
            </div>
            <div>
              <p className="eyebrow mb-2">Book</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Stop Being Prey, the book. In progress.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* === Subscribe === */}
      <section
        id="join"
        className="max-w-3xl mx-auto px-6 py-16 text-center"
      >
        <p className="eyebrow mb-5">Subscribe</p>
        <h2
          className="font-display tracking-tight mb-6 leading-[1.05]"
          style={{
            fontSize: "clamp(2rem, 4vw, 3.25rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Get the daily letter.
        </h2>
        <p className="deck mb-10 max-w-xl mx-auto">
          Original writing on politics and power, every morning. The same
          writing that builds Stop Being Prey. Free. No ads. No sponsors. No
          paywalls.
        </p>
        <div className="flex justify-center">
          <EmailSignup />
        </div>
        <p className="text-xs italic text-ink-faint mt-6">
          Unsubscribe anytime. We never share your email.
        </p>
      </section>
    </div>
  );
}
