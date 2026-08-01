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
import { EyeDivider } from "@/components/Eyes";
import { ShareButtons } from "@/components/ShareButtons";
import { CharterSeatsCount } from "@/components/CharterSeats";
import { AuthorBio } from "@/components/AuthorBio";
import { ArticlePostscript } from "@/components/ArticlePostscript";
import { InlineSubscribe } from "@/components/InlineSubscribe";
import { ReadingTracker } from "@/components/ReadingTracker";
import { ReadThisNext } from "@/components/ReadThisNext";
import { splitForInlineCta, stripCtaMarker } from "@/lib/inline-cta";
import { isPaidViewer } from "@/lib/viewer";
import { recordEvent } from "@/lib/analytics";
import { Comments } from "@/components/Comments";
import type { Metadata } from "next";

// The site's ordinary inline-link treatment (same values as
// ArticlePostscript): a hairline eye-colored underline sitting clear of
// the baseline. Deliberately NOT a CTA style — these are links in a
// sentence.
const inlineLinkClass = "text-eye-deep hover:text-ink";
const inlineLinkStyle: React.CSSProperties = {
  textDecoration: "underline",
  textDecorationColor: "var(--eye)",
  textDecorationThickness: "1px",
  textUnderlineOffset: "3px",
};

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
    // Self-referencing canonical so query params (?fbclid=…), trailing
    // slashes, and the like don't split ranking signal across duplicate
    // URLs. Resolved against metadataBase (https://stopbeingprey.com).
    alternates: {
      canonical: `/${slug}`,
      types: { "application/rss+xml": "/feed.xml" },
    },
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
        // Counted server-side, not from the client: the gate ships almost
        // no JS and a beacon would miss anyone who bounces immediately,
        // which is exactly the population worth knowing about. Fire and
        // forget so a slow counter never delays the render. Lands in this
        // piece's per-article counters beside its views.
        void recordEvent("gate_shown", { slug: article.slug });
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

  // End-of-essay recirculation. The prequel is PINNED first when the
  // piece has one: it is the single most relevant next read, and sorting
  // by date alone buried it (the losertarian piece is older than the two
  // newest essays, so it never surfaced under the Charlie piece). The
  // remaining slot goes to the newest other essay.
  const others = getAllArticles().filter((a) => a.slug !== article.slug);
  const prequel = article.prequelSlug
    ? others.find((a) => a.slug === article.prequelSlug)
    : undefined;
  // Explicit frontmatter picks win outright when present — the right next
  // read is an editorial call more often than a date sort gets it right.
  const picked = article.readNextSlugs
    ?.map((slug) => others.find((a) => a.slug === slug))
    .filter((a) => a !== undefined);
  const readNext = (picked?.length ? picked : [
    ...(prequel ? [prequel] : []),
    ...others.filter((a) => a.slug !== prequel?.slug),
  ])
    .slice(0, 2)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
    }));

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

  // Podcast schema for pieces with a Spotify episode, so search engines and
  // podcast directories read them as episodes of the show, not just essays.
  const podcastJsonLd = article.spotifyEpisodeId
    ? {
        "@context": "https://schema.org",
        "@type": "PodcastEpisode",
        name: article.title,
        description: article.description,
        datePublished: article.date,
        url: `https://stopbeingprey.com/${article.slug}`,
        associatedMedia: {
          "@type": "MediaObject",
          contentUrl: `https://open.spotify.com/episode/${article.spotifyEpisodeId}`,
        },
        partOfSeries: {
          "@type": "PodcastSeries",
          name: "Stop Being Prey",
          url: "https://open.spotify.com/show/6Pjbl5jXQlOoHpVn696V1t",
        },
        author: { "@type": "Person", name: "Clay" },
      }
    : null;

  return (
    <article className="relative">
      {article.published !== false && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {article.published !== false && podcastJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(podcastJsonLd) }}
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

          {/* Deck. `subtitle` is the editorial line, `description` is the
              search/share blurb, and they're often written differently. The
              homepage lead and /writing already preferred subtitle while this
              page used description, so the same essay introduced itself two
              different ways depending on where you met it. All three read
              subtitle-first now, falling back to description when a piece
              doesn't carry one. */}
          <p className="deck max-w-2xl mx-auto mb-10 fade-up stagger-3">
            {article.subtitle ?? article.description}
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

      {/* === Article body ===
           Masthead's border-b carries the only separator. No
           decorative swash between subtitle and body — same
           treatment now used on the founding pages. */}
      <div
        id="reading-region"
        className="max-w-4xl mx-auto px-6 pt-12 md:pt-16"
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
            // No form here (captures hidden, opted out, or too short to
            // split). Strip any {{CTA}} marker so it never shows as raw text.
            dangerouslySetInnerHTML={{
              __html: stripCtaMarker(article.contentHtml),
            }}
          />
        )}

        {/* === P.S. directly under the article body, no drop cap. A quiet,
             deliberate footer: a single intentional gap below the closing
             quote, then the muted italic note — no orphaned "silence" band
             between them. Essay-style pieces get a touch more breathing room
             than standard articles (they close on a quote, not a paragraph),
             but not the old 8rem void. If the frontmatter carries a
             `postscript` field, that custom markdown wins; otherwise fall
             back to the stable-hash rotation across the three variants. === */}
        {/* The whole postscript wrapper, not just its contents — an empty
            div still carried mt-16, which left a 4rem hole under the
            sign-off on pieces that suppress the p.s. and made the two
            section gaps below unequal. */}
        {article.postscript !== false && (
          <div
            className={`max-w-[38rem] mx-auto ${
              article.essayStyle && !article.postscriptHtml
                ? "mt-12 md:mt-16"
                : "mt-8"
            }`}
          >
            {/* Soft footer divider: the same short olive hairline the
                blockquote captions use, so the P.S. reads as a deliberate
                closing note rather than a floating line. It only ever
                appears WITH a p.s. — alone under the sign-off it read as
                a quote-attribution rule missing its attribution. */}
            <div
              aria-hidden="true"
              className="mb-7"
              style={{ width: "4rem", height: "1px", background: "var(--eye-deep)" }}
            />
            {article.postscriptHtml ? (
              <div
                className="postscript-block"
                dangerouslySetInnerHTML={{ __html: article.postscriptHtml }}
              />
            ) : (
              <ArticlePostscript slug={article.slug} />
            )}
          </div>
        )}
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

      {/* === Share row, directly under the P.S. where the "pass it on"
          impulse is strongest. The P.S. often makes the share ask in
          words ("send it to one person who'd get it"), so the buttons
          follow the sentence. Kept ABOVE the email/membership capture so
          the low-friction action lands before the heavier ask. === */}
      {/* Centered on purpose. The rule below the sign-off: body copy sits
          on the left margin, break elements sit on the centre line. The
          share row is a break, so it centers; the patronage paragraph
          under it is body copy, so it does not. Nested on the same 38rem
          measure as that paragraph, so both occupy one column and only
          differ in how they align inside it.

          mt-14 lands the measured gap at 3.5rem, matching the gap below
          the share row exactly — roughly double a paragraph gap, which is
          what makes both breaks read as section changes now that the two
          separator rules are gone. */}
      <div className="max-w-3xl mx-auto px-6 mt-14">
        <div className="mx-auto" style={{ maxWidth: "38rem" }}>
          <ShareButtons
            url={`/${article.slug}`}
            title={article.title}
            slug={article.slug}
          />
        </div>
      </div>

      {/* === The ask, as a LADDER not a menu. It used to be a two-column
          "Two ways in" block with free sitting beside paid, plus a second
          email capture below it, which meant three competing asks and two
          email forms under one essay. Now: one opening line, one loud
          primary (patronage), one deliberately subordinate fallback (the
          free list). The two are NOT siblings — the fallback is narrower,
          smaller, unboxed, and its submit button is a ghost rather than a
          filled one. Suppressed entirely for paying patrons. === */}
      {!hideCaptures && (
      <section className="max-w-3xl mx-auto px-6 pt-14 pb-10 md:pb-14">
        {/* Prose, not a widget. No form controls on the page at all: the
            ask is three paragraphs in the essay's own body face and size,
            on the essay's own measure (38rem, matching .prose-article), so
            it reads as the closing paragraphs of the piece. The two links
            are ordinary inline links in a sentence — the house underline
            treatment — not calls to action. One 4rem hairline above, the
            same rule the quote attributions use. Nothing else. */}
        <div className="mx-auto" style={{ maxWidth: "38rem" }}>
          <div
            className="font-serif text-ink space-y-6"
            style={{ fontSize: "1.07rem", lineHeight: 1.65 }}
          >
            <p>
              If you recognized the flock, you&apos;re who I write for.
            </p>
            <p>
              This piece took a month. No advertiser was ever going to pay
              for it. Patrons did, and they read it first.{" "}
              <CharterSeatsCount /> charter seats left at $13 a month, locked
              for life.{" "}
              <Link href="/patronage" className={inlineLinkClass} style={inlineLinkStyle}>
                Become a patron
              </Link>
              .
            </p>
            <p>
              Not ready for that?{" "}
              <Link href="/join" className={inlineLinkClass} style={inlineLinkStyle}>
                The writing goes out free by email
              </Link>
              , nearly every day.
            </p>
          </div>
        </div>
      </section>
      )}

      {/* === The patron's closer. The ladder above is suppressed for people
          who already pay, which left them with no ask at all except the
          muted Wall line far below the comments, the bio and the audio
          block. The readers most likely to give more were the ones the
          page asked least. So patrons get their own closer in the same
          slot, same prose treatment, same measure: not a second membership
          pitch, and not a tip jar. The Wall is where a reader backs one
          specific piece and signs their name to it, which is the thing a
          recurring subscription can't express. The quiet Wall line below
          is suppressed when this shows, so there is only ever one. === */}
      {hideCaptures && (
      <section className="max-w-3xl mx-auto px-6 pt-14 pb-10 md:pb-14">
        <div className="mx-auto" style={{ maxWidth: "38rem" }}>
          <div
            className="font-serif text-ink space-y-6"
            style={{ fontSize: "1.07rem", lineHeight: 1.65 }}
          >
            <p>
              You already pay for this. It&apos;s the reason the piece exists
              at all.
            </p>
            <p>
              If this one hit you,{" "}
              <Link href="/wall" className={inlineLinkClass} style={inlineLinkStyle}>
                the Wall
              </Link>{" "}
              is where readers leave a message and sign their name to it.
            </p>
          </div>
        </div>
      </section>
      )}


      <EyeDivider />

      {/* === Comments. Members-only input; visible to all readers,
          with a soft join CTA underneath for anonymous visitors.
          Moved up so the conversation sits right after the work,
          before the chrome (bio, share, audio, tip jar). === */}
      <Comments kind="article" slug={article.commentSlug ?? article.slug} patron />

      {/* === Author bio === */}
      <div className="max-w-3xl mx-auto px-6 mt-16">
        <AuthorBio />
      </div>

      {/* === Audio Edition: full embed for readers who want to queue
          or revisit the spoken version. The masthead carries the quiet
          "Listen" pill; this is the full player for those who want it. === */}
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

      {/* === Support nudge. The publication is reader-funded; the Wall is
          where readers back the work and sign their name. Reframed from the
          old "tip jar" line, which undercut the Wall's support-first
          framing. Present for everyone EXCEPT paying patrons, who get the
          fuller Wall closer up in the ask slot instead. Two Wall asks on
          one page would read as nagging, and the quiet one down here would
          be the weaker of the two. === */}
      {!hideCaptures && (
      <section className="max-w-2xl mx-auto px-6 mt-12 text-center">
        <p className="font-serif italic text-ink-muted leading-relaxed">
          Reader-supported.{" "}
          <Link
            href="/wall"
            className="text-eye-deep hover:text-ink"
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--eye)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
            }}
          >
            Add your name to the Wall.
          </Link>
        </p>
      </section>
      )}

      <EyeDivider />

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
