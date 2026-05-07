import Link from "next/link";
import { SpotifyEmbed } from "@/components/SpotifyEmbed";
import { EyeDivider } from "@/components/Eyes";
import { getAllArticles } from "@/lib/articles";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Podcast",
  description:
    "Stop Being Prey, the podcast. Politics, power, and predator/prey dynamics in 2026. Clay reads each essay aloud.",
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

const estimateMinutes = (wordCount?: number) =>
  wordCount ? Math.round(wordCount / 150) : null;

export default function PodcastPage() {
  const episodes = getAllArticles().filter((a) => a.spotifyEpisodeId);

  return (
    <div>
      {/* === Podcast masthead === */}
      <section className="border-b border-rule">
        <div className="max-w-5xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-5 fade-up stagger-1">The podcast</p>
          <h1
            className="font-display text-ink leading-[0.95] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6.5vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Stop Being Prey
          </h1>
          <p className="deck max-w-2xl mx-auto mb-10 fade-up stagger-3">
            Clay reads each essay aloud. Politics, power, and predator/prey
            dynamics in 2026. New episodes most days.
          </p>
          <div className="flex flex-wrap justify-center gap-3 fade-up stagger-4">
            <a
              href="https://open.spotify.com/show/6Pjbl5jXQlOoHpVn696V1t"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <span>Open in Spotify</span>
            </a>
            <a
              href="https://anchor.fm/s/1121c68b8/podcast/rss"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              Apple Podcasts
            </a>
            <a
              href="https://anchor.fm/s/1121c68b8/podcast/rss"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              RSS
            </a>
          </div>
        </div>
      </section>

      <EyeDivider />

      {/* === Episode archive === */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <p className="eyebrow mb-12 text-center">All Episodes</p>
        <div className="space-y-20">
          {episodes.map((episode, idx) => {
            const minutes = estimateMinutes(episode.wordCount);
            const isIssue = typeof episode.issue === "number";
            // Margin numeral is always the sequential episode number,
            // newest-first. Issue status lives in the eyebrow above the
            // title (and the gold left rule on issue articles), never
            // in the margin number, so two episodes can't appear to
            // share the same number.
            const numeral = String(episodes.length - idx).padStart(2, "0");
            return (
              <article
                key={episode.slug}
                className={`group relative pl-0 md:pl-20 ${
                  isIssue ? "md:border-l-2 md:border-eye md:-ml-6 md:pl-24" : ""
                }`}
              >
                {/* Big numeral on the left */}
                <div className="hidden md:block absolute left-0 top-2">
                  <span
                    className="font-display leading-none whitespace-nowrap"
                    style={{
                      fontSize: "3rem",
                      fontWeight: 700,
                      letterSpacing: "0",
                      color: "var(--ink-faint, #c8b994)",
                    }}
                  >
                    {numeral}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs italic text-ink-faint mb-3 uppercase not-italic tracking-[0.18em]">
                  {isIssue && (
                    <>
                      <span
                        className="px-2 py-0.5 border border-eye text-eye-deep"
                        style={{ letterSpacing: "0.18em", fontWeight: 600 }}
                      >
                        Issue No. {episode.issue}
                      </span>
                      <span className="text-rule">·</span>
                    </>
                  )}
                  <time dateTime={episode.date}>
                    {formatDate(episode.date)}
                  </time>
                  {minutes && (
                    <>
                      <span className="text-rule">·</span>
                      <span>{minutes} min</span>
                    </>
                  )}
                </div>

                <h2
                  className="font-display tracking-tight mb-4 leading-[1.05]"
                  style={{
                    fontSize: "clamp(1.85rem, 3vw, 2.5rem)",
                    fontWeight: 700,
                    fontVariationSettings: '"SOFT" 30, "WONK" 0',
                    letterSpacing: "-0.02em",
                  }}
                >
                  {isIssue ? (
                    <Link
                      href={`/${episode.slug}`}
                      className="text-ink group-hover:text-eye-deep transition-colors no-underline"
                    >
                      {episode.title}
                    </Link>
                  ) : (
                    <span className="text-ink">{episode.title}</span>
                  )}
                </h2>

                <p className="deck mb-6">{episode.description}</p>

                <SpotifyEmbed
                  episodeId={episode.spotifyEpisodeId}
                  type="episode"
                  size="compact"
                />

                {isIssue && (
                  <div className="mt-4 flex items-center gap-4">
                    <Link
                      href={`/${episode.slug}`}
                      className="font-display text-sm uppercase tracking-[0.18em] text-ink-muted hover:text-eye-deep no-underline transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      Read the issue →
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* P.S. author note at the bottom of the episode list */}
        <div className="mt-24 max-w-2xl mx-auto pt-8 border-t border-rule">
          <p className="italic text-ink-muted leading-relaxed" style={{ fontSize: "1.05rem" }}>
            <span className="text-ink not-italic" style={{ fontWeight: 600 }}>p.s.</span>{" "}
            reader-supported. if any of this earned a few bucks in your
            eyes, the tip jar is{" "}
            <Link
              href="/tip"
              className="text-eye-deep hover:text-ink"
              style={{
                textDecoration: "underline",
                textDecorationColor: "var(--eye)",
                textDecorationThickness: "1px",
                textUnderlineOffset: "3px",
              }}
            >
              here
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
