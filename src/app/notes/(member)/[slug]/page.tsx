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
    title: `${note.title} · Field Notes`,
    description: note.excerpt,
  };
}

function formatDate(date: string): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
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
      {/* Masthead */}
      <header className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Field Note No. {note.number}
            {note.date && (
              <>
                {" · "}
                {formatDate(note.date)}
              </>
            )}
          </p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-3 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.022em",
            }}
          >
            {note.title}
          </h1>
        </div>
      </header>

      {/* Screenshot + live post link */}
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

      {/* Annotation */}
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-6">
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

      {/* Back to feed */}
      <div className="text-center pb-16">
        <Link
          href="/notes"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← all field notes
        </Link>
      </div>
    </article>
  );
}
