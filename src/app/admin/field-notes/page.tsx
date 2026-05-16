import Link from "next/link";
import type { Metadata } from "next";
import { getAllFieldNotesWithActivity } from "@/lib/field-notes";

export const metadata: Metadata = {
  title: "Field Notes, admin",
};

export const dynamic = "force-dynamic";

function formatActivity(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function FieldNotesAdminPage() {
  const notes = await getAllFieldNotesWithActivity();
  const journals = notes.filter((n) => n.kind === "journal");
  const legacies = notes.filter((n) => n.kind === "legacy");

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <h1
        className="font-display text-ink leading-tight tracking-tight mb-3"
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Field Notes
      </h1>
      <p className="font-serif italic text-ink-muted mb-10">
        Journal-style notes accept new entries from this admin.
        Legacy single-essay notes are shown for context but don&apos;t
        have an entry queue.
      </p>

      {/* Journal-style — these are the writable ones */}
      <section className="mb-12">
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
            Journals · in progress
          </span>
          <span className="flex-1 h-px bg-rule" />
        </div>

        {journals.length === 0 ? (
          <p className="font-serif italic text-ink-faint">
            No journal-style Field Notes yet. Create one by adding a
            markdown file under <code>content/field-notes/</code> with
            an <code>article_title</code> in its frontmatter.
          </p>
        ) : (
          <ul className="flex flex-col">
            {journals.map((n, i) => (
              <li
                key={n.slug}
                className={i === 0 ? "py-5" : "py-5 border-t border-rule"}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow mb-2">
                      <span style={{ color: "var(--eye-deep)" }}>
                        {n.status}
                      </span>
                      <span className="mx-2 text-rule">·</span>
                      {n.entryCount}{" "}
                      {n.entryCount === 1 ? "entry" : "entries"}
                      <span className="mx-2 text-rule">·</span>
                      Last activity {formatActivity(n.lastActivityAt)}
                    </p>
                    <p
                      className="font-display text-ink leading-tight"
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                      }}
                    >
                      {n.title}
                    </p>
                    {n.latestEntryTitle && (
                      <p className="font-serif italic text-ink-muted mt-1">
                        {n.latestEntryTitle}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <Link
                      href={`/admin/field-notes/${n.slug}`}
                      className="font-display uppercase no-underline transition-colors"
                      style={{
                        fontSize: "0.68rem",
                        letterSpacing: "0.22em",
                        fontWeight: 600,
                        color: "var(--eye-deep)",
                        border: "1px solid var(--eye-deep)",
                        padding: "0.4rem 0.8rem",
                      }}
                    >
                      Manage →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Legacy — read-only here */}
      {legacies.length > 0 && (
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
              Legacy essays
            </span>
            <span className="flex-1 h-px bg-rule" />
          </div>
          <ul className="flex flex-col">
            {legacies.map((n, i) => (
              <li
                key={n.slug}
                className={i === 0 ? "py-4" : "py-4 border-t border-rule"}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow mb-1">
                      shipped
                      {n.date && (
                        <>
                          <span className="mx-2 text-rule">·</span>
                          {formatActivity(n.lastActivityAt)}
                        </>
                      )}
                    </p>
                    <p
                      className="font-display text-ink"
                      style={{ fontSize: "1.05rem", fontWeight: 500 }}
                    >
                      {n.title}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Link
                      href={`/notes/field-notes/${n.slug}`}
                      className="text-ink-muted hover:text-eye-deep font-display uppercase no-underline transition-colors"
                      style={{
                        fontSize: "0.62rem",
                        letterSpacing: "0.22em",
                        fontWeight: 600,
                      }}
                    >
                      view →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
