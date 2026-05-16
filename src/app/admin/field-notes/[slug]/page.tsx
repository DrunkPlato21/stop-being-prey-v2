import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFieldNoteBySlug } from "@/lib/field-notes";
import { FieldNoteEntryForm } from "@/components/FieldNoteEntryForm";

export const metadata: Metadata = {
  title: "Field Note, admin",
};

export const dynamic = "force-dynamic";

function formatEntryDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function FieldNoteAdminDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const note = await getFieldNoteBySlug(slug);
  if (!note) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <p className="eyebrow mb-3">
        <Link
          href="/admin/field-notes"
          className="text-ink-muted hover:text-eye-deep no-underline"
        >
          ← all field notes
        </Link>
      </p>

      <h1
        className="font-display text-ink leading-tight tracking-tight mb-3"
        style={{
          fontSize: "clamp(1.6rem, 4vw, 2.3rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        {note.title}
      </h1>

      <p className="font-serif italic text-ink-muted mb-2">
        <span style={{ color: "var(--eye-deep)" }}>{note.status}</span>
        {note.expectedTimeline && (
          <>
            <span className="mx-2 text-rule">·</span>
            <span>{note.expectedTimeline}</span>
          </>
        )}
        <span className="mx-2 text-rule">·</span>
        <span>{note.public ? "Member-visible" : "Private (hidden)"}</span>
        <span className="mx-2 text-rule">·</span>
        <Link
          href={`/notes/field-notes/${slug}`}
          className="text-ink-muted hover:text-eye-deep"
        >
          view as a member →
        </Link>
      </p>

      {note.kind === "legacy" && (
        <div
          className="mt-8 p-5 border border-rule font-serif text-ink-muted leading-relaxed"
          style={{ background: "var(--surface)" }}
        >
          This is a legacy-style Field Note — single-essay format, no
          entry queue. To convert it into a journal-style note, add{" "}
          <code>article_title</code> to the frontmatter of{" "}
          <code>content/field-notes/{slug}.md</code> and move the essay
          body content into an entry via the form below.
        </div>
      )}

      <hr className="border-rule my-10" />

      {/* New entry form — only useful for journal-style notes, but
          we'll render it for legacy too in case the admin wants to
          start adding entries to convert it. */}
      <section className="mb-12">
        <h2
          className="font-display text-ink mb-2"
          style={{
            fontSize: "1.2rem",
            fontWeight: 600,
            letterSpacing: "-0.015em",
          }}
        >
          Append a new entry
        </h2>
        <p className="font-serif italic text-ink-muted mb-6">
          Date defaults to today. Title is short — a line or a phrase.
          Body accepts markdown.
        </p>
        <FieldNoteEntryForm slug={slug} />
      </section>

      <hr className="border-rule my-10" />

      {/* Existing entries — newest first */}
      <section>
        <div className="flex items-center gap-4 mb-5">
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
            {note.entries.length}{" "}
            {note.entries.length === 1 ? "entry" : "entries"} · newest first
          </span>
          <span className="flex-1 h-px bg-rule" />
        </div>

        {note.entries.length === 0 ? (
          <p className="font-serif italic text-ink-faint">
            No entries yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {note.entries.map((e, i) => (
              <li
                key={e.id}
                className={i === 0 ? "py-5" : "py-5 border-t border-rule"}
              >
                <p className="eyebrow mb-2">
                  {formatEntryDate(e.date)}
                </p>
                <p
                  className="font-display text-ink leading-tight mb-2"
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                  }}
                >
                  {e.title}
                </p>
                <p
                  className="font-serif text-ink-muted leading-relaxed whitespace-pre-wrap"
                  style={{ fontSize: "0.95rem" }}
                >
                  {e.body.length > 240 ? e.body.slice(0, 240) + "…" : e.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
