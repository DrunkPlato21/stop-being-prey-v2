import Link from "next/link";
import type { Metadata } from "next";
import {
  listAll,
  type Note,
  type NoteStatus,
} from "@/lib/notes";
import { AdminNoteRow } from "@/components/AdminNoteRow";

export const metadata: Metadata = {
  title: "Notes queue",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
};

function normalizeStatus(input: string | undefined): NoteStatus | "all" | "active" {
  switch (input) {
    case "active":
    case "all":
    case "new":
    case "read":
    case "replied":
    case "archived":
      return input;
    default:
      return "active";
  }
}

function FilterPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="font-display uppercase no-underline transition-colors"
      style={{
        fontSize: "0.68rem",
        letterSpacing: "0.22em",
        fontWeight: 600,
        color: active ? "var(--eye-deep)" : "var(--ink-muted)",
        border: "1px solid",
        borderColor: active ? "var(--eye-deep)" : "var(--rule)",
        padding: "0.35rem 0.75rem",
      }}
    >
      {label}
    </Link>
  );
}

export default async function NotesAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status = normalizeStatus(params.status);

  const notes: Note[] = await listAll({ status });

  // Counts span everything (including archived) so the pills can
  // accurately label how many sit in each bucket.
  const totals = await listAll({ status: "all", limit: 200 });
  const counts = {
    active: totals.filter((n) => n.status !== "archived").length,
    new: totals.filter((n) => n.status === "new").length,
    read: totals.filter((n) => n.status === "read").length,
    replied: totals.filter((n) => n.status === "replied").length,
    archived: totals.filter((n) => n.status === "archived").length,
  };

  function url(next: NoteStatus | "all" | "active"): string {
    // Active is the default — drop the param to keep URLs clean.
    if (next === "active") return "/admin/notes";
    return `/admin/notes?status=${next}`;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <h1
        className="font-display text-ink leading-tight tracking-tight mb-6"
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Notes queue
      </h1>
      <p className="font-serif italic text-ink-muted mb-8">
        Reader notes posted to the public board. Newest first. Archived
        notes drop off the active view but stay retrievable below.
      </p>

      {/* Status filter rail — visibility filter is gone, every note
          is public now. Active is the default working set; Archived
          is the recoverable "trash" view. */}
      <div className="flex flex-wrap items-center gap-2 mb-10">
        <span
          className="font-display uppercase text-ink-faint mr-1"
          style={{
            fontSize: "0.62rem",
            letterSpacing: "0.28em",
            fontWeight: 600,
          }}
        >
          Show
        </span>
        <FilterPill
          href={url("active")}
          label={`Active (${counts.active})`}
          active={status === "active"}
        />
        <FilterPill
          href={url("new")}
          label={`New (${counts.new})`}
          active={status === "new"}
        />
        <FilterPill
          href={url("read")}
          label={`Read (${counts.read})`}
          active={status === "read"}
        />
        <FilterPill
          href={url("replied")}
          label={`Replied (${counts.replied})`}
          active={status === "replied"}
        />
        <FilterPill
          href={url("archived")}
          label={`Archived (${counts.archived})`}
          active={status === "archived"}
        />
      </div>

      {notes.length === 0 ? (
        <p className="font-serif italic text-ink-faint">
          Nothing here matches that filter.
        </p>
      ) : (
        <ul className="flex flex-col">
          {notes.map((note, idx) => (
            <li
              key={note.id}
              className={
                idx === 0 ? "py-7" : "py-7 border-t border-rule"
              }
            >
              <AdminNoteRow note={note} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
