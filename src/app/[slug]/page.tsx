import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  getAllArticles,
  getArticleBySlug,
  audioRuntimeMinutes,
  readingMinutes,
  type Article,
} from "@/lib/articles";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { SpotifyEmbed } from "@/components/SpotifyEmbed";
import { AudioPill } from "@/components/AudioPill";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";
import { EyeDivider } from "@/components/Eyes";
import { ShareButtons } from "@/components/ShareButtons";
import { AuthorBio } from "@/components/AuthorBio";
import { ArticlePostscript } from "@/components/ArticlePostscript";
import { InlineSubscribe } from "@/components/InlineSubscribe";
import { ReadingTracker } from "@/components/ReadingTracker";
import { ReadThisNext } from "@/components/ReadThisNext";
import { splitForInlineCta } from "@/lib/inline-cta";
import { isPaidViewer } from "@/lib/viewer";
import { Comments } from "@/components/Comments";
import type { Metadata } from "next";

type PageParams = { slug: string };

export async function generateStaticParams() {
  // Published articles only. Drafts (published: false) are intentionally
  // left out of static generation so they aren't prerendered or listed;
  // their URL still resolves on demand (dynamicParams defaults to true)
  // where the gate below decides who may see them.
  return getAllArticles().map((a) => ({ slug: a.slug }));
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
    // While unpublished, keep the draft out of search indexes. Flipping
    // `published: true` removes this and the page indexes normally.
    ...(article.published === false
      ? { robots: { index: false, follow: false } }
      : {}),
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

  // URL hygiene. Email clients (Outlook, parts of Gmail) sometimes
  // include the sentence-ending period when auto-linking a URL like
  // "Visit https://stopbeingprey.com/membership.". Strip a trailing
  // "." and redirect to the cleaned slug. Site slug convention is
  // [a-z0-9-]+ so no legitimate route ends in a period.
  if (slug.endsWith(".") && slug.length > 1) {
    redirect("/" + slug.slice(0, -1));
  }

  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  // Draft gate. An unpublished issue stays at its real URL but is not
  // public yet: signed-in members read it (the early-access window keeps
  // running), non-members get the join prompt instead of the body. On
  // localhost the dev server bypasses the gate so the author can preview
  // freely. Published articles never reach this branch — so they never
  // touch cookies() and stay fully static. Flip `published: true` to
  // launch: the gate disappears and everyone reads it.
  if (article.published === false) {
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) {
      const session = await verifySession(
        (await cookies()).get(SESSION_COOKIE)?.value
      );
      if (!session?.email) {
        return <DraftGate article={article} />;
      }
    }
  }

  const dateStr = new Date(article.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Audio runtime for the pill: real `audioMinutes` when set, else the
  // ~150 wpm word-count estimate.
  const audioMinutes = audioRuntimeMinutes(article);
  // Silent reading time for the byline (faster ~225 wpm pace).
  const readMin = readingMinutes(article);

  // End-of-essay recirculation: the 2 newest other published essays
  // (excluding this one and its prequel, which already gets its own link).
  const readNext = getAllArticles()
    .filter((a) => a.slug !== article.slug && a.slug !== article.prequelSlug)
    .slice(0, 2)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
    }));

  // "Podcast-only" pieces — articles that exist primarily as
  // episodes, not numbered issues. Detected by: has a spotify
  // episode id AND no issue number. These get the full Spotify
  // player at the top (player IS the primary content), with the
  // text as transcript-style support below. Issue-style articles
  // keep the click-to-expand AudioPill in the masthead + the
  // standalone Audio Edition embed at the bottom.
  const isPodcastOnly =
    !!article.spotifyEpisodeId && typeof article.issue !== "number";

  // Paying members (and the admin/author) are already on the list and in
  // the room, so suppress the email-capture surfaces for them — the inline
  // form and the end-of-piece "Two ways in" block. Everything else (read
  // time, comments, recirculation, tip) stays. Cheap: the page is already
  // dynamic via the layout's auth.
  const hideCaptures = await isPaidViewer();

  // Inline mid-article email capture, on every article (essayStyle pieces
  // split at an Act heading; both halves keep the ea-essay class so the
  // Act-divider + pull-quote styling is preserved). A {{CTA}} marker in the
  // body pins the exact spot; `inlineCta: false` in frontmatter opts the
  // piece out entirely. splitForInlineCta returns null for short pieces.
  const inlineSplit =
    hideCaptures || article.inlineCta === false
      ? null
      : splitForInlineCta(article.contentHtml);

  // Article structured data (JSON-LD) for rich search results: headline,
  // author, dates, publisher. Emitted only for published essays.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    dateModified: article.date,
    author: {
      "@type": "Person",
      name: "Clay",
      url: "https://stopbeingprey.com/about",
    },
    publisher: {
      "@type": "Organization",
      name: "Stop Being Prey",
      url: "https://stopbeingprey.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://stopbeingprey.com/${article.slug}`,
    },
    image: "https://stopbeingprey.com/opengraph-image.jpg",
    ...(article.wordCount ? { wordCount: article.wordCount } : {}),
  };

  return (
    <article className="relative">
      {article.published !== false && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}

      {/* Funnel analytics: fires `view` on mount and scroll-depth
          milestones as the reader moves through #reading-region below.
          Renders nothing. */}
      <ReadingTracker slug={article.slug} />

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
            {readMin && (
              <>
                <span className="text-rule">·</span>
                <span>{readMin} min read</span>
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
        id="reading-region"
        className={`max-w-4xl mx-auto px-6 ${
          isPodcastOnly ? "pt-8 md:pt-10" : "pt-12 md:pt-16"
        }`}
      >
        {inlineSplit ? (
          <>
            <div
              className={`prose-article${article.essayStyle ? " ea-essay" : ""}`}
              dangerouslySetInnerHTML={{ __html: inlineSplit.before }}
            />
            <InlineSubscribe slug={article.slug} />
            <div
              className={`prose-article${article.essayStyle ? " ea-essay" : ""}`}
              dangerouslySetInnerHTML={{ __html: inlineSplit.after }}
            />
          </>
        ) : (
          <div
            className={`prose-article${article.essayStyle ? " ea-essay" : ""}`}
            dangerouslySetInnerHTML={{ __html: article.contentHtml }}
          />
        )}

        {/* Essay-style pieces (e.g. the Massie issue) close on a pull-
            quote meant to land on silence. Give that ending a big gap to
            breathe, then a light email-capture beat — a line + a link to
            /join, deliberately not a form — before the share P.S. below.
            Scoped to essayStyle so ordinary essays keep their tighter
            ending. */}
        {article.essayStyle && (
          <div className="max-w-2xl mx-auto mt-32 md:mt-48 text-center">
            <p
              className="font-serif italic text-ink-muted leading-relaxed"
              style={{ fontSize: "1.05rem" }}
            >
              stay close. the next one goes out by email first.
            </p>
            <p className="mt-4">
              <Link
                href="/join"
                className="font-display text-eye-deep hover:text-ink no-underline transition-colors"
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                get on the list &rarr;
              </Link>
            </p>
          </div>
        )}

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

      {/* === Share row, right after the work (under the P.S.), where the
          "pass it on" impulse is strongest — not buried below the
          comments and bio. === */}
      <div className="max-w-2xl mx-auto px-6 mt-12">
        <ShareButtons url={`/${article.slug}`} title={article.title} />
      </div>

      <EyeDivider />

      {/* === Comments. Members-only input; visible to all readers,
          with a soft join CTA underneath for anonymous visitors.
          Moved up so the conversation sits right after the work,
          before the chrome (bio, share, audio, tip jar). === */}
      <Comments kind="article" slug={article.commentSlug ?? article.slug} />

      {/* === Author bio === */}
      <div className="max-w-3xl mx-auto px-6 mt-16">
        <AuthorBio />
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

      {/* === "Two ways in" conversion surface — dual paths so the reader
          picks the level of commitment that fits. Suppressed for paying
          members (they're already in); they still get the recirculation
          block below. === */}
      {!hideCaptures && (
      <section className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        <p className="eyebrow mb-8 text-center">Two ways in</p>
        {/* Tailored membership ask in the piece's own voice, when set
            (frontmatter `closingCta`). Sits at the conversion surface,
            above the generic dual block. */}
        {article.closingCtaHtml && (
          <div
            className="max-w-2xl mx-auto mb-10 text-center font-serif text-ink leading-relaxed [&_a]:text-eye-deep [&_a:hover]:text-ink"
            style={{ fontSize: "1.15rem" }}
            dangerouslySetInnerHTML={{ __html: article.closingCtaHtml }}
          />
        )}
        <DualSubscribeBlock />
        {/* "The argument starts here" — pull engaged readers deeper into
            the series instead of bouncing (frontmatter `prequelSlug`). */}
        {article.prequelSlug && article.prequelLabel && (
          <div className="mt-10 text-center">
            <Link
              href={`/${article.prequelSlug}`}
              className="eyebrow no-underline hover:text-ink transition-colors"
            >
              Start here: {article.prequelLabel} &rarr;
            </Link>
          </div>
        )}
      </section>
      )}

      {/* === Read this next. Exit-point recirculation, below the
          conversion CTA so it never competes with it. === */}
      <ReadThisNext items={readNext} />

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

// Shown to non-members who hit an unpublished issue at its real URL. A
// quiet prompt in place of the body — same register as the old standalone
// early-access page: a path to join and a path to sign in. The essay text
// is never sent down this branch. Disappears entirely once the issue is
// published (the gate above stops running).
function DraftGate({ article }: { article: Article }) {
  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">Members &middot; Early access</p>
        <h1
          className="font-display text-ink leading-[1.02] tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          {article.title}
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">{article.description}</p>

        <Link href="/membership" className="btn-primary">
          <span>See what&apos;s inside</span>
        </Link>

        <p className="mt-12 text-sm italic text-ink-muted leading-relaxed max-w-md mx-auto">
          Already a member?{" "}
          <Link
            href={`/notes/sign-in?next=/${article.slug}`}
            className="text-eye-deep hover:text-ink"
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--eye)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
            }}
          >
            Sign in.
          </Link>
        </p>
      </section>
    </div>
  );
}
