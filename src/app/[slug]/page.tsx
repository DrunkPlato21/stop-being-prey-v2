import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getAllArticleSlugs,
  getArticleBySlug,
} from "@/lib/articles";
import { SpotifyEmbed } from "@/components/SpotifyEmbed";
import { AudioPill } from "@/components/AudioPill";
import { EmailSignup } from "@/components/EmailSignup";
import { EyeDivider } from "@/components/Eyes";
import { ShareButtons } from "@/components/ShareButtons";
import { AuthorBio } from "@/components/AuthorBio";
import { ArticlePostscript } from "@/components/ArticlePostscript";
import { SubscriberCount } from "@/components/SubscriberCount";
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
  // Read time estimate (industry standard 250 wpm), shown in metadata.
  const readMinutes = article.wordCount
    ? Math.max(1, Math.ceil(article.wordCount / 250))
    : null;

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
            {readMinutes && (
              <>
                <span className="text-rule">·</span>
                <span>{readMinutes} min</span>
              </>
            )}
            <span className="text-rule">·</span>
            <span>Reader-supported</span>
          </div>

          {article.spotifyEpisodeId && audioMinutes && (
            <div className="mt-8 fade-up stagger-5 flex justify-center">
              <AudioPill
                episodeId={article.spotifyEpisodeId}
                minutes={audioMinutes}
              />
            </div>
          )}
        </div>
      </header>

      <EyeDivider />

      {/* === Article body === */}
      <div className="max-w-4xl mx-auto px-6">
        <div
          className="prose-article"
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />

        {/* === P.S. directly under the article body, no drop cap.
             One of three variants chosen by a stable hash of the slug,
             so a given article always renders the same P.S. but
             different articles get different ones. === */}
        <div className="max-w-[38rem] mx-auto mt-8">
          <ArticlePostscript slug={article.slug} />
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

      {/* === Share row, catches the just-finished impulse === */}
      <div className="max-w-2xl mx-auto px-6">
        <ShareButtons url={`/${article.slug}`} title={article.title} />
      </div>

      {/* === Audio Edition: full embed for readers who want to queue
          or revisit the spoken version === */}
      {article.spotifyEpisodeId && (
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

      {/* === Author bio === */}
      <div className="max-w-3xl mx-auto px-6 mt-16">
        <AuthorBio />
      </div>

      <EyeDivider />

      {/* === More like this. Compact end-of-article subscribe block.
          Restrained real estate, no framed card. === */}
      <section className="max-w-2xl mx-auto px-6 py-10 md:py-14 text-center">
        <p className="eyebrow mb-4">More like this</p>
        <p className="deck mb-6 max-w-md mx-auto">
          Algorithms don&apos;t deliver this writing. It only arrives if
          you ask.
        </p>
        <SubscriberCount className="mb-5" />
        <div className="flex justify-center">
          <EmailSignup />
        </div>
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
