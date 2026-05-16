import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAllFieldNoteSlugs,
  getFieldNoteBySlug,
  renderMarkdownToHtml,
  type FieldNoteEntry,
  type FieldNoteStatus,
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
    title: { absolute: `${note.title} | Field Notes | Stop Being Prey` },
    description: note.excerpt,
    robots: {
      index: false,
      follow: false,
    },
  };
}

// "Wednesday May 13, 2026." — weekday-prefixed, period-terminated.
function formatLongDate(date: string): string {
  if (!date) return "";
  const formatted = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return formatted.replace(/^(\w+),\s/, "$1 ") + ".";
}

function formatEntryDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function statusLabel(status: FieldNoteStatus): string {
  // Display-cased version of the status enum. Lowercase elsewhere
  // (URL params, frontmatter, Redis) but the page wants it readable.
  switch (status) {
    case "drafting":
      return "Drafting";
    case "researching":
      return "Researching";
    case "in revision":
      return "In revision";
    case "shipped":
      return "Shipped";
  }
}

export default async function FieldNotePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const note = await getFieldNoteBySlug(slug);
  if (!note) notFound();

  if (note.kind === "journal") {
    return <JournalFieldNote note={note} slug={slug} />;
  }
  return <LegacyFieldNote note={note} slug={slug} />;
}

/* === Journal-style render =================================================
 * Article title (prominent), status + expected timeline metadata line,
 * meta_intro fixed at top, divider, "Entries (newest first)" label,
 * then each entry rendered as a card with date / title / markdown body.
 */
async function JournalFieldNote({
  note,
  slug,
}: {
  note: Awaited<ReturnType<typeof getFieldNoteBySlug>> & object;
  slug: string;
}) {
  if (!note) notFound();
  const entryBodies = await Promise.all(
    note.entries.map(async (e) => ({
      entry: e,
      html: await renderMarkdownToHtml(e.body),
    }))
  );

  return (
    <article className="relative">
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Field Note</p>
          <h1
            className="font-display text-ink leading-[0.98] tracking-tight mb-5 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {note.title}
          </h1>
          <p
            className="font-display fade-up stagger-3"
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--ink-muted)",
            }}
          >
            <span style={{ color: "var(--eye-deep)" }}>
              {statusLabel(note.status)}
            </span>
            {note.expectedTimeline && (
              <>
                <span className="mx-3 text-rule">·</span>
                <span>{note.expectedTimeline}</span>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Meta intro — the fixed paragraph explaining the format. */}
      {note.contentHtml.trim().length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pt-12 md:pt-14 pb-2">
          <div
            className="prose-article fieldnote-meta"
            dangerouslySetInnerHTML={{ __html: note.contentHtml }}
          />
        </div>
      )}

      {/* Divider + Entries label */}
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-6">
        <div className="flex items-center gap-4">
          <span
            className="font-display"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--ink-faint)",
            }}
          >
            Entries · newest first
          </span>
          <span className="flex-1 h-px bg-rule" />
        </div>
      </div>

      {/* Entries list */}
      <div className="max-w-3xl mx-auto px-6 pb-12 md:pb-16">
        {entryBodies.length === 0 ? (
          <p className="font-serif italic text-ink-muted leading-relaxed py-8">
            No entries yet. Check back as the work begins.
          </p>
        ) : (
          <ul className="flex flex-col gap-10 list-none p-0 m-0">
            {entryBodies.map(({ entry, html }, i) => (
              <li key={entry.id}>
                <FieldNoteEntryCard
                  entry={entry}
                  html={html}
                  showTopBorder={i > 0}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Comments. Members only — proxy.ts gates this whole route. */}
      <Comments kind="note" slug={slug} />

      <EyeDivider />

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

function FieldNoteEntryCard({
  entry,
  html,
  showTopBorder,
}: {
  entry: FieldNoteEntry;
  html: string;
  showTopBorder: boolean;
}) {
  // The "Entries · newest first" label above the list already provides
  // a hairline. Drawing another above the first entry stutters the
  // composition. Subsequent entries keep the divider as the
  // between-entry separator.
  return (
    <article
      className="fieldnote-entry"
      style={
        showTopBorder
          ? { borderTop: "1px solid var(--rule)", paddingTop: "1.75rem" }
          : undefined
      }
    >
      <p
        className="eyebrow mb-3"
        style={{ fontSize: "0.85rem", letterSpacing: "0.22em" }}
      >
        {formatEntryDate(entry.date)}
      </p>
      <h2
        className="font-display text-ink leading-tight tracking-tight mb-5"
        style={{
          fontSize: "clamp(1.4rem, 2.8vw, 1.9rem)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {entry.title}
      </h2>
      <div
        className="prose-article"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

/* === Legacy essay render =================================================
 * Original rendering — preserved verbatim for back-room essays
 * (e.g. two-days-out, _legacy/001-three-moves-in-one-sentence).
 */
function LegacyFieldNote({
  note,
  slug,
}: {
  note: Awaited<ReturnType<typeof getFieldNoteBySlug>> & object;
  slug: string;
}) {
  if (!note) notFound();
  return (
    <article className="relative">
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          {note.number !== null && (
            <p className="eyebrow mb-6 fade-up stagger-1">
              Field Note №{note.number}
            </p>
          )}
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

      <div className="max-w-3xl mx-auto px-6 pt-12 md:pt-16 pb-6">
        <div
          className="prose-article"
          dangerouslySetInnerHTML={{ __html: note.contentHtml }}
        />
      </div>

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

      <Comments kind="note" slug={slug} />

      <EyeDivider />

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
