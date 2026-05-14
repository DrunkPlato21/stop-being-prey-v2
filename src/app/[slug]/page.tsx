import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getAllArticleSlugs,
  getArticleBySlug,
} from "@/lib/articles";
import { SpotifyEmbed } from "@/components/SpotifyEmbed";
import { AudioPill } from "@/components/AudioPill";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";
import { EyeDivider } from "@/components/Eyes";
import { ShareButtons } from "@/components/ShareButtons";
import { AuthorBio } from "@/components/AuthorBio";
import { ArticlePostscript } from "@/components/ArticlePostscript";
import { Comments } from "@/components/Comments";
import type { Metadata } from "next";

type PageParams = { slug: string };

export async function generateStaticParams() {
  return getAllArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      publishedTime: article.date,
      authors: ["Clay"],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      creator: "@stopbeingprey",
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  const dateStr = new Date(article.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Audio runtime estimate (~150 wpm spoken), used in the audio pill.
  const audioMinutes = article.wordCount
    ? Math.round(article.wordCount / 150)
    : null;

  // "Podcast-only" pieces — articles that exist primarily as
  // episodes, not numbered issues. Detected by: has a spotify
  // episode id AND no issue number. These get the full Spotify
  // player at the top (player IS the primary content), with the
  // text as transcript-style support below. Issue-style articles
  // keep the click-to-expand AudioPill in the masthead + the
  // standalone Audio Edition embed at the bottom.
  const isPodcastOnly =
    !!article.spotifyEpisodeId && typeof article.issue !== "number";

  return (
    <article className="relative">
      {/* === Article masthead === */}
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          {article.chapter && (
            <p className="eyebrow mb-6 fade-up stagger-1">
              Chapter {article.chapter} · Stop Being Prey
            </p>
          )}

          <h1
            className="font-display text-ink leading-[0.98] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {article.title}
          </h1>

          <p className="deck max-w-2xl mx-auto mb-10 fade-up stagger-3">
            {article.description}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-2 text-xs italic text-ink-faint fade-up stagger-4 uppercase tracking-[0.15em] not-italic">
            <span>By Clay</span>
            <span className="text-rule">·</span>
            <time dateTime={article.date}>{dateStr}</time>
            {article.wordCount && (
              <>
                <span className="text-rule">·</span>
                <span>{article.wordCount.toLocaleString("en-US")} words</span>
              </>
            )}
          </div>

          {article.spotifyEpisodeId && audioMinutes && !isPodcastOnly && (
            <div className="mt-8 fade-up stagger-5 flex justify-center">
              <AudioPill
                episodeId={article.spotifyEpisodeId}
                minutes={audioMinutes}
              />
            </div>
          )}
        </div>
      </header>

      {/* === Top-of-page audio embed for podcast-only pieces ===
           For pieces where the podcast IS the primary content (no
           issue number, spotifyEpisodeId set), the full player sits
           directly under the masthead so it's reachable on first
           paint — no click-to-expand. Bottom "Audio Edition" block
           is suppressed below to avoid duplicate players on the page. */}
      {isPodcastOnly && article.spotifyEpisodeId && (
        <div className="max-w-2xl mx-auto px-6 pt-12 md:pt-16">
          <SpotifyEmbed
            episodeId={article.spotifyEpisodeId}
            type="episode"
            size="standard"
          />
        </div>
      )}

      {/* === Article body ===
           Masthead's border-b carries the only separator. No
           decorative swash between subtitle and body — same
           treatment now used on the founding pages. Top padding
           drops when the podcast-only embed is already breathing
           above us. */}
      <div
        className={`max-w-4xl mx-auto px-6 ${
          isPodcastOnly ? "pt-8 md:pt-10" : "pt-12 md:pt-16"
        }`}
      >
        <div
          className="prose-article"
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />

        {/* === P.S. directly under the article body, no drop cap.
             If the article frontmatter carries a `postscript` field,
             that custom markdown wins. Otherwise fall back to the
             stable-hash rotation across the three default variants. === */}
        <div className="max-w-[38rem] mx-auto mt-8">
          {article.postscriptHtml ? (
            <div
              className="postscript-block"
              dangerouslySetInnerHTML={{ __html: article.postscriptHtml }}
            />
          ) : (
            <ArticlePostscript slug={article.slug} />
          )}
        </div>
      </div>

      {/* === References (opt-in, populated when markdown ends with
          `## References` followed by a list). Sits with the article
          body since citations are part of the work itself === */}
      {article.referencesHtml && (
        <div className="max-w-3xl mx-auto px-6 mt-16">
          <div className="references-block">
            <p className="references-block-eyebrow">References</p>
            <div
              dangerouslySetInnerHTML={{ __html: article.referencesHtml }}
            />
          </div>
        </div>
      )}

      <EyeDivider />

      {/* === Comments. Members-only input; visible to all readers,
          with a soft join CTA underneath for anonymous visitors.
          Moved up so the conversation sits right after the work,
          before the chrome (bio, share, audio, tip jar). === */}
      <Comments kind="article" slug={article.slug} />

      {/* === Author bio === */}
      <div className="max-w-3xl mx-auto px-6 mt-16">
        <AuthorBio />
      </div>

      {/* === Share row, catches the just-finished impulse === */}
      <div className="max-w-2xl mx-auto px-6 mt-16">
        <ShareButtons url={`/${article.slug}`} title={article.title} />
      </div>

      {/* === Audio Edition: full embed for readers who want to queue
          or revisit the spoken version. Suppressed on podcast-only
          pieces — the player already lives at the top, no need for
          a duplicate at the bottom. === */}
      {article.spotifyEpisodeId && !isPodcastOnly && (
        <div className="max-w-2xl mx-auto px-6 mt-16">
          <div className="text-center mb-4">
            <p className="eyebrow">Audio Edition</p>
          </div>
          <SpotifyEmbed
            episodeId={article.spotifyEpisodeId}
            type="episode"
            size="standard"
          />
        </div>
      )}

      {/* === Tip nudge. Always present (independent of P.S. variant)
          so the publication's funding model surfaces on every essay,
          not just the third that gets variant C. === */}
      <section className="max-w-2xl mx-auto px-6 mt-12 text-center">
        <p className="font-serif italic text-ink-muted leading-relaxed">
          Reader-supported.{" "}
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
            The tip jar is here.
          </Link>
        </p>
      </section>

      <EyeDivider />

      {/* === More like this. End-of-article conversion surface —
          dual paths so the reader picks the level of commitment
          that fits where they are right now. === */}
      <section className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        <p className="eyebrow mb-8 text-center">More like this</p>
        <DualSubscribeBlock />
      </section>

      <div className="text-center pb-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← All essays
        </Link>
      </div>
    </article>
  );
}
