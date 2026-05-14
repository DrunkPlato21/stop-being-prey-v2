import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAllFieldNoteSlugs,
  getFieldNoteBySlug,
} from "@/lib/field-notes";
import { EyeDivider } from "@/components/Eyes";
import { Comments } from "@/components/Comments";

type PageParams = { slug: string };

export async function generateStaticParams() {
  return getAllFieldNoteSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const note = await getFieldNoteBySlug(slug);
  if (!note) return {};
  return {
    // `absolute` bypasses the root layout's "%s · Stop Being Prey"
    // template so the tab title reads exactly as spec'd, without a
    // doubled site suffix.
    title: { absolute: `${note.title} | Field Notes | Stop Being Prey` },
    description: note.excerpt,
    // Gated content — keep it out of search indexes even though
    // proxy.ts redirects unauthenticated visitors to sign-in.
    robots: {
      index: false,
      follow: false,
    },
  };
}

// "Wednesday May 13, 2026." — weekday-prefixed, period-terminated.
// Matches the subtitle treatment on the founding-page register that
// the new Field Notes are aligned with. UTC timezone so the date in
// the markdown frontmatter doesn't drift across the dateline.
function formatLongDate(date: string): string {
  if (!date) return "";
  const formatted = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  // Strip the comma the en-US locale inserts after the weekday.
  return formatted.replace(/^(\w+),\s/, "$1 ") + ".";
}

export default async function FieldNotePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const note = await getFieldNoteBySlug(slug);
  if (!note) notFound();

  return (
    <article className="relative">
      {/* === Masthead =============================================
          Founding-register typography: eyebrow with the № glyph,
          large serif title (matches /founding/* pages exactly), an
          italic subtitle with the full weekday-prefixed date, and
          the header's own border-b serves as the hairline beneath
          the subtitle the spec calls for. */}
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Field Note №{note.number}
          </p>
          <h1
            className="font-display text-ink leading-[0.98] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {note.title}
          </h1>
          {note.date && (
            <p
              className="font-serif italic text-ink-muted fade-up stagger-3"
              style={{ fontSize: "1rem" }}
            >
              {formatLongDate(note.date)}
            </p>
          )}
        </div>
      </header>

      {/* Screenshot + live post link — legacy fields kept for the
          tactical-breakdown shape some older Field Notes carried.
          New-style back-room essays leave these null. */}
      {note.screenshot && (
        <div className="max-w-3xl mx-auto px-6 pt-10">
          <div className="bg-surface border border-border p-3 sm:p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={note.screenshot}
              alt={`Screenshot for ${note.title}`}
              className="block w-full h-auto"
            />
          </div>
          {note.livePostUrl && (
            <div className="mt-3 text-right">
              <a
                href={note.livePostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display text-xs uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
                style={{ fontWeight: 600 }}
              >
                see the live post →
              </a>
            </div>
          )}
        </div>
      )}

      {/* === Body =================================================
          Markdown body. Section breaks (`---` in markdown) render
          as the centered hairline `<hr>` styled by .prose-article. */}
      <div className="max-w-3xl mx-auto px-6 pt-12 md:pt-16 pb-6">
        <div
          className="prose-article"
          dangerouslySetInnerHTML={{ __html: note.contentHtml }}
        />
      </div>

      {/* Doctrine tags */}
      {note.doctrineTags.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pb-10">
          <div className="border-t border-rule pt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span className="eyebrow" style={{ letterSpacing: "0.22em" }}>
              Doctrine
            </span>
            <span className="text-rule">·</span>
            {note.doctrineTags.map((tag, i) => (
              <span key={tag} className="inline-flex items-center gap-3">
                <span
                  className="eyebrow"
                  style={{
                    letterSpacing: "0.22em",
                    color: "var(--eye-deep)",
                  }}
                >
                  {tag}
                </span>
                {i < note.doctrineTags.length - 1 && (
                  <span className="text-rule">·</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* === Comments. Members only — proxy.ts gates this whole route,
          so the input always renders for the visitor. === */}
      <Comments kind="note" slug={slug} />

      <EyeDivider />

      {/* Back to archive */}
      <div className="text-center pb-16">
        <Link
          href="/notes/field-notes"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to field notes
        </Link>
      </div>
    </article>
  );
}
