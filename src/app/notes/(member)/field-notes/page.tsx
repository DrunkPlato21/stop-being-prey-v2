import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  getAllFieldNotesWithActivity,
  type FieldNoteMetaWithActivity,
  type FieldNoteStatus,
} from "@/lib/field-notes";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { markNavViewed } from "@/lib/nav-dots";

export const metadata: Metadata = {
  title: "Field Notes",
  description: "The work being made, in real time. Members only.",
};

export const dynamic = "force-dynamic";

function formatActivityDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function statusLabel(status: FieldNoteStatus): string {
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

export default async function FieldNotesIndexPage() {
  const notes = await getAllFieldNotesWithActivity();

  // Clear the field-notes nav dot for this member.
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  if (session?.email) {
    await markNavViewed("field-notes", session.email).catch(() => null);
  }

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
            A Field Note is the working journal of a piece in progress.
            Short entries land as the writing happens. Not polished, not
            rehearsed. When the piece ships, the Note becomes the record
            of how it was made. Until then, you&apos;re inside the work.
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
                <FieldNoteRow note={note} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FieldNoteRow({ note }: { note: FieldNoteMetaWithActivity }) {
  const dateText = formatActivityDate(note.lastActivityAt);
  return (
    <Link
      href={`/notes/field-notes/${note.slug}`}
      className="block no-underline group"
    >
      <p className="eyebrow mb-3">
        <span style={{ color: "var(--eye-deep)" }}>
          {statusLabel(note.status)}
        </span>
        {dateText && (
          <>
            <span className="mx-2 text-rule">·</span>
            <span>
              {note.kind === "journal" && note.entryCount > 0
                ? `Last entry ${dateText}`
                : dateText}
            </span>
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
      {note.kind === "journal" && note.latestEntryTitle ? (
        <p
          className="font-serif text-ink-muted leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          <span className="font-display italic" style={{ fontWeight: 500 }}>
            {note.latestEntryTitle}
          </span>
          {note.excerpt && (
            <>
              <span className="mx-2 text-rule">—</span>
              <span>{note.excerpt}</span>
            </>
          )}
        </p>
      ) : (
        <p
          className="font-serif text-ink-muted leading-relaxed"
          style={{ fontSize: "1.02rem" }}
        >
          {note.excerpt}
        </p>
      )}
    </Link>
  );
}
