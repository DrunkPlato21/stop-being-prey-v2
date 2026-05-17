import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  findSuccessor,
  getAllCaseFiles,
  getAllCaseFileSlugs,
  getCaseFileBySlug,
  RULE_ROMAN,
  RULE_SHORT_LABEL,
  type CaseFile,
} from "@/lib/case-files";
import { EyeDivider } from "@/components/Eyes";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { markNavViewed } from "@/lib/nav-dots";

type PageParams = { slug: string };

// Page is auth-gated by proxy.ts middleware on every request anyway,
// and we now read the session cookie inside the body to clear the nav
// dot. Explicitly opt into dynamic rendering so Next doesn't emit a
// build-time warning about the cookies() call shadowing the static
// generation path.
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return getAllCaseFileSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cf = getCaseFileBySlug(slug);
  if (!cf) return {};
  return {
    title: { absolute: `${cf.title} | Case Files | Stop Being Prey` },
    description: cf.situation[0] ?? cf.move[0] ?? "",
    // Members-only case files stay out of the index; public-preview
    // case files (marketing/email funnel surfaces) flip indexable
    // so they can be shared and ranked.
    robots: cf.publicPreview
      ? { index: true, follow: true }
      : { index: false, follow: false },
    alternates: cf.publicPreview
      ? { canonical: `/case-files/${cf.slug}` }
      : undefined,
    openGraph: cf.publicPreview
      ? {
          title: cf.title,
          description: cf.situation[0] ?? cf.move[0] ?? "",
          type: "article",
          authors: ["Clay"],
          url: `/case-files/${cf.slug}`,
          images: cf.screenshot ? [cf.screenshot.src] : undefined,
        }
      : undefined,
    twitter: cf.publicPreview
      ? {
          card: "summary_large_image",
          title: cf.title,
          description: cf.situation[0] ?? cf.move[0] ?? "",
          creator: "@stopbeingprey",
          images: cf.screenshot ? [cf.screenshot.src] : undefined,
        }
      : undefined,
  };
}

// "April 14, 2026". Concise — the subtitle row carries date,
// archetype, and platform as three peer tokens joined by middle
// dots, so a weekday prefix would push the line into a second wrap
// on mobile.
function formatDate(date: string): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Previous in chronological order" — i.e., the case file that comes
 *  AFTER this one in the archive's newest-first list (the user's
 *  "next case file" pointer at the bottom of the detail page).
 *
 *  The archive is sorted newest-first. The "next case file" link
 *  should send the reader to the next-newest piece — the entry that
 *  appears one slot ABOVE the current case file in the archive list.
 *  At the top of the archive (newest), there's no next, so null. */
function findNextCaseFile(current: CaseFile): CaseFile | null {
  const all = getAllCaseFiles();
  const idx = all.findIndex((c) => c.slug === current.slug);
  if (idx <= 0) return null;
  return all[idx - 1];
}

// Body section. Same shape for Situation / Move / Trap / Frame Shift.
// Pulled into a component to keep the page render terse.
function BodySection({
  label,
  paragraphs,
}: {
  label: string;
  paragraphs: string[];
}) {
  if (paragraphs.length === 0) return null;
  return (
    <section className="mb-12">
      <p
        className="eyebrow mb-4"
        style={{ fontSize: "0.7rem", letterSpacing: "0.32em" }}
      >
        {label}
      </p>
      <div className="font-serif text-ink leading-relaxed flex flex-col gap-4" style={{ fontSize: "1.1rem" }}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}

export default async function CaseFileDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const cf = getCaseFileBySlug(slug);
  if (!cf) notFound();

  // Auth-aware rendering. Members see the standard page; cold-traffic
  // visitors landing on a public-preview slug get the sign-off swapped
  // for a sales CTA and the footer nav repointed at /membership.
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  const previewMode = !session?.email && cf.publicPreview;

  // Clear the nav dot — a member who came in via a direct link to a
  // specific case file has still effectively engaged with the section.
  if (session?.email) {
    await markNavViewed("case-files", session.email).catch(() => null);
  }

  const nextCase = findNextCaseFile(cf);
  // Continuation links. Backward = predecessor explicitly named in
  // this case file's frontmatter. Forward = any case file pointing
  // at THIS slug via continues_from (auto-discovered, no field on
  // this record to maintain). Both are suppressed in preview mode
  // since those routes are still gated and would dead-end at the
  // sign-in page rather than another readable artifact.
  const predecessor =
    !previewMode && cf.continuesFrom
      ? getCaseFileBySlug(cf.continuesFrom)
      : null;
  const successor = previewMode ? null : findSuccessor(cf.slug);

  return (
    <article className="rules-paper">
      {/* === Masthead =============================================
          Founding-register typography: eyebrow with the № glyph,
          large serif title (matches /founding/* and Field Note
          detail pages), italic subtitle with date · archetype ·
          platform, and the header's border-b carries the hairline
          rule the spec calls for. */}
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Case File №{cf.number}
          </p>
          <h1
            className="font-display text-ink leading-[0.98] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {cf.title}
          </h1>
          <p
            className="font-serif italic text-ink-muted fade-up stagger-3"
            style={{ fontSize: "1rem" }}
          >
            {formatDate(cf.date)} &middot; {cf.archetype} &middot;{" "}
            {cf.platform}
          </p>
        </div>
      </header>

      {/* === Body sections =======================================
          Same width and rhythm as the Rules page so members read
          case files and rules in the same column. */}
      <section className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10">
        {/* Backward continuation. Sits at the top of the body so a
            reader landing on a sequel knows the previous round
            exists before they read a single sentence. */}
        {predecessor && (
          <p className="mb-10">
            <Link
              href={`/case-files/${predecessor.slug}`}
              className="font-serif italic text-ink-muted hover:text-eye-deep no-underline transition-colors"
              style={{ fontSize: "0.98rem" }}
            >
              ← Round one in Case File №{predecessor.number}:{" "}
              <span
                className="not-italic text-eye-deep"
                style={{ fontWeight: 500 }}
              >
                {predecessor.title}
              </span>
            </Link>
          </p>
        )}

        <BodySection label="The Situation" paragraphs={cf.situation} />
        <BodySection label="The Move" paragraphs={cf.move} />

        {/* === Evidence ==========================================
            Visual proof of the engagement, positioned right after
            "The Move" so the reader has Clay's read of the move in
            their head before they see the artifact. Centered, full
            content-column width, thin olive border, alt text, and
            an italic caption beneath. Omitted when the case has no
            screenshot (anonymized cases, dead links, etc.). */}
        {cf.screenshot && (
          <figure className="mb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cf.screenshot.src}
              alt={cf.screenshot.alt}
              className="block h-auto mx-auto"
              style={{
                maxWidth: "100%",
                border: "1px solid var(--eye-deep)",
                background: "var(--paper)",
              }}
            />
            <figcaption
              className="font-serif italic text-ink-muted text-center mt-3"
              style={{ fontSize: "0.92rem" }}
            >
              {cf.screenshot.caption}
              {cf.livePostUrl && (
                <>
                  {" "}
                  <a
                    href={cf.livePostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
                    style={{ fontWeight: 500 }}
                  >
                    see the live post →
                  </a>
                </>
              )}
            </figcaption>
          </figure>
        )}

        <BodySection label="The Trap" paragraphs={cf.trap} />
        <BodySection
          label="The Frame Shift"
          paragraphs={cf.frameShift}
        />

        {/* === Wall screenshot ===================================
            Second screenshot slot, positioned downstream of THE
            FRAME SHIFT. Used by case files about a writer-side
            payoff (a wall, a donor surface, an audience reaction)
            where the artifact isn't the critic's comment but the
            consequence of refusing to engage with it. Same visual
            treatment as the critic-comment screenshot. */}
        {cf.wallScreenshot && (
          <figure className="mb-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cf.wallScreenshot.src}
              alt={cf.wallScreenshot.alt}
              className="block h-auto mx-auto"
              style={{
                maxWidth: "100%",
                border: "1px solid var(--eye-deep)",
                background: "var(--paper)",
              }}
            />
            <figcaption
              className="font-serif italic text-ink-muted text-center mt-3"
              style={{ fontSize: "0.92rem" }}
            >
              {cf.wallScreenshot.caption}
              {cf.wallScreenshot.liveUrl && (
                <>
                  {" "}
                  <a
                    href={cf.wallScreenshot.liveUrl}
                    className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
                    style={{ fontWeight: 500 }}
                  >
                    see the live wall →
                  </a>
                </>
              )}
            </figcaption>
          </figure>
        )}

        {/* === The Exhibit =======================================
            Member message / donor quote / audience reaction that
            functions as the payoff. Intro paragraph sets up the
            quote, the quote sits in a paper callout with an
            attribution row above (name + amount left, date right
            small caps), framing paragraph closes the meaning. Same
            olive accent register as the One-Shot but renders the
            row-header so a member reading the page recognizes the
            beat as audience-sourced rather than Clay-sourced. */}
        {cf.exhibit && (
          <section className="mb-12">
            <p
              className="eyebrow mb-4"
              style={{ fontSize: "0.7rem", letterSpacing: "0.32em" }}
            >
              The Exhibit
            </p>
            {cf.exhibit.intro && (
              <p
                className="font-serif text-ink leading-relaxed mb-6"
                style={{ fontSize: "1.1rem" }}
              >
                {cf.exhibit.intro}
              </p>
            )}
            <div
              className="mb-6 px-5 py-5 md:px-6 md:py-6"
              style={{
                background: "var(--paper)",
                borderLeft: "2px solid var(--eye-deep)",
              }}
            >
              {/* Attribution row: name (+ amount) on the left,
                  date in small-caps on the right. Hairline beneath
                  separates the header from the quote — matches the
                  design reference. */}
              <div className="flex items-baseline justify-between gap-4 pb-3 mb-4 border-b border-rule flex-wrap">
                <span
                  className="font-display text-ink"
                  style={{ fontSize: "1rem", fontWeight: 500 }}
                >
                  {cf.exhibit.attributionName}
                  {cf.exhibit.attributionAmount && (
                    <>
                      {" "}
                      <span
                        className="text-eye-deep"
                        style={{ fontWeight: 500 }}
                      >
                        &middot; {cf.exhibit.attributionAmount}
                      </span>
                    </>
                  )}
                </span>
                {cf.exhibit.attributionDate && (
                  <span
                    className="font-display uppercase text-eye-deep"
                    style={{
                      fontSize: "0.72rem",
                      letterSpacing: "0.22em",
                      fontWeight: 600,
                    }}
                  >
                    {cf.exhibit.attributionDate}
                  </span>
                )}
              </div>
              <p
                className="font-serif italic text-ink leading-relaxed"
                style={{ fontSize: "1.1rem" }}
              >
                &ldquo;{cf.exhibit.quote}&rdquo;
              </p>
            </div>
            {cf.exhibit.framing && (
              <p
                className="font-serif text-ink leading-relaxed"
                style={{ fontSize: "1.1rem" }}
              >
                {cf.exhibit.framing}
              </p>
            )}
          </section>
        )}

        {/* === The One-Shot ======================================
            Bordered callout, olive left border, paper interior,
            italic serif body. Visual treatment matches the FORMAT
            mockup at the bottom of the archive page so members
            recognize the deployable line the moment they see it. */}
        {cf.oneShot && (
          <section
            className="mb-12 px-5 py-5 md:px-6 md:py-6"
            style={{
              background: "var(--paper)",
              borderLeft: "2px solid var(--eye-deep)",
            }}
          >
            <p
              className="eyebrow mb-3"
              style={{ fontSize: "0.7rem", letterSpacing: "0.32em" }}
            >
              The One-Shot
            </p>
            <p
              className="font-display text-ink leading-snug"
              style={{
                fontSize: "1.22rem",
                fontWeight: 500,
                fontStyle: "italic",
                letterSpacing: "-0.005em",
              }}
            >
              &ldquo;{cf.oneShot}&rdquo;
            </p>
          </section>
        )}

        {/* === Rules Applied =====================================
            Olive small-caps links to the corresponding rule's
            anchor on the Rules of Engagement page. Same `.rule-demo`
            link vocabulary the rules page uses so members recognize
            the styling immediately. */}
        {cf.rulesApplied.length > 0 && (
          <section className="mb-12">
            <p
              className="eyebrow mb-4"
              style={{ fontSize: "0.7rem", letterSpacing: "0.32em" }}
            >
              Rules Applied
            </p>
            <p
              className="rule-demo"
              style={{ margin: 0, fontSize: "0.98rem" }}
            >
              {cf.rulesApplied.map((n, i) => (
                <span key={n}>
                  {i > 0 && (
                    <span style={{ color: "var(--rule)" }}>
                      {"  ·  "}
                    </span>
                  )}
                  <Link href={`/notes/rules#rule-${n}`}>
                    Rule {RULE_ROMAN[n - 1]} &middot;{" "}
                    {RULE_SHORT_LABEL[n]}
                  </Link>
                </span>
              ))}
            </p>
          </section>
        )}

        {/* === Outcome ===========================================
            Optional single line. Some case files don't record one
            (the encounter is still live, or the outcome wasn't the
            point). Omit the whole block when there's nothing to
            print. */}
        {cf.outcome && (
          <section className="mb-12">
            <p
              className="eyebrow mb-3"
              style={{ fontSize: "0.7rem", letterSpacing: "0.32em" }}
            >
              Outcome
            </p>
            <p
              className="font-serif text-ink leading-relaxed"
              style={{ fontSize: "1.05rem" }}
            >
              {cf.outcome}
            </p>
          </section>
        )}

        {/* === Forward continuation =============================
            "Continued in Case File №N: … →" — surfaced on the
            predecessor side automatically when a successor case
            file points back via continues_from. Sits in its own
            block above the sign-off so the reader sees the
            doctrine-payoff sequel cue before the closing beat. */}
        {successor && (
          <p className="mt-10 mb-6 text-center">
            <Link
              href={`/case-files/${successor.slug}`}
              className="font-serif italic text-ink-muted hover:text-eye-deep no-underline transition-colors"
              style={{ fontSize: "0.98rem" }}
            >
              Continued in Case File №{successor.number}:{" "}
              <span
                className="not-italic text-eye-deep"
                style={{ fontWeight: 500 }}
              >
                {successor.title}
              </span>
              {" "}→
            </Link>
          </p>
        )}

        {/* === Sign-off / Preview CTA ============================
            Members get the standard doctrine sign-off. Cold-traffic
            visitors on a public-preview case file get a quiet sales
            CTA in the same visual register — paper-deep callout,
            olive border, single inline link to /membership. The
            preview pitch echoes the Lounge / Field Notes / Book
            language from the /membership page so the funnel reads
            as one continuous voice. */}
        {previewMode ? (
          <div
            className="mt-14 px-6 py-7 md:px-9 md:py-8"
            style={{
              background: "var(--paper-deep)",
              borderLeft: "2px solid var(--eye-deep)",
            }}
          >
            <p
              className="eyebrow mb-3"
              style={{ fontSize: "0.66rem", letterSpacing: "0.32em" }}
            >
              Inside the Membership
            </p>
            <p
              className="font-display text-ink leading-snug tracking-tight mb-4"
              style={{
                fontSize: "clamp(1.35rem, 2.4vw, 1.6rem)",
                fontWeight: 700,
                letterSpacing: "-0.015em",
              }}
            >
              Four more case files like this one. Plus the Writer&apos;s
              Desk, the Lounge, Field Notes, and the book in progress.
            </p>
            <p
              className="font-serif text-ink-soft mb-5"
              style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
            >
              100 founder seats. $8/month locked for life. Over half
              are gone. When the door closes, the price goes to $13
              forever.
            </p>
            <p>
              <Link
                href="/membership"
                className="text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontWeight: 600 }}
              >
                Become a founder &rarr;
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-14 pt-10 border-t border-rule text-center">
            <p
              className="font-serif italic text-ink-muted leading-relaxed mb-3"
              style={{ fontSize: "1.05rem" }}
            >
              the doctrine teaches. the case files drill.
            </p>
            <p
              className="font-display text-ink"
              style={{ fontSize: "1rem", fontWeight: 500 }}
            >
              stay close,
              <br />~ Clay
            </p>
          </div>
        )}
      </section>

      <EyeDivider />

      {/* === Footer navigation ====================================
          Members see the archive-step nav (back to /case-files,
          next case file). Preview viewers get a single membership
          link instead — every escape route funnels. */}
      {previewMode ? (
        <nav
          aria-label="Case files navigation"
          className="max-w-3xl mx-auto px-6 pb-16 text-center"
        >
          <Link
            href="/membership"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            Join the membership &rarr;
          </Link>
        </nav>
      ) : (
        <nav
          aria-label="Case files navigation"
          className="max-w-3xl mx-auto px-6 pb-16 flex flex-wrap items-center justify-between gap-y-3"
        >
          <Link
            href="/case-files"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← back to case files
          </Link>
          {nextCase && (
            <Link
              href={`/case-files/${nextCase.slug}`}
              className="text-ink-muted hover:text-eye-deep font-display text-sm no-underline transition-colors text-right"
              style={{ fontWeight: 500 }}
            >
              <span
                className="uppercase tracking-[0.18em] block"
                style={{ fontSize: "0.7rem" }}
              >
                Next case file
              </span>
              <span
                className="font-serif italic text-eye-deep"
                style={{ fontSize: "1rem", letterSpacing: 0 }}
              >
                {nextCase.title} &rarr;
              </span>
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
