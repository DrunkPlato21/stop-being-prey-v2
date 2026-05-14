import Link from "next/link";
import type { Metadata } from "next";
import { getAllFieldNotes } from "@/lib/field-notes";

export const metadata: Metadata = {
  title: "Field Notes",
  description: "Annotated breakdowns of real engagements. Members only.",
};

export const dynamic = "force-dynamic";

function formatDate(date: string): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function FieldNotesIndexPage() {
  const notes = getAllFieldNotes();

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-20 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Field Notes.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Annotated breakdowns of real engagements. Screenshots, post
            links, doctrine tags. The footwork behind the public writing.
          </p>
        </div>
      </section>

      {/* List */}
      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        {notes.length === 0 ? (
          <p className="font-display italic text-ink-muted text-center leading-relaxed">
            The first Field Note is being prepared. Check back soon.
          </p>
        ) : (
          <ul className="flex flex-col">
            {notes.map((note, idx) => (
              <li
                key={note.slug}
                className={
                  idx === 0 ? "py-8" : "py-8 border-t border-rule"
                }
              >
                <Link
                  href={`/notes/field-notes/${note.slug}`}
                  className="block no-underline group"
                >
                  <p className="eyebrow mb-3">
                    Field Note №{note.number}
                    {note.date && (
                      <>
                        {" · "}
                        {formatDate(note.date)}
                      </>
                    )}
                  </p>
                  <h3
                    className="font-display text-ink leading-tight tracking-tight mb-3 group-hover:text-eye-deep transition-colors"
                    style={{
                      fontSize: "clamp(1.6rem, 3vw, 2.1rem)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {note.title}
                  </h3>
                  <p
                    className="font-serif text-ink-muted leading-relaxed"
                    style={{ fontSize: "1.02rem" }}
                  >
                    {note.excerpt}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
