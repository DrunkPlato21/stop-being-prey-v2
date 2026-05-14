import Link from "next/link";
import type { Metadata } from "next";
import { getBook } from "@/lib/book";
import { BookAdminForm } from "@/components/BookAdminForm";

export const metadata: Metadata = {
  title: "Book, admin",
};

export const dynamic = "force-dynamic";

// Admin editor for the single book record. HTTP Basic auth gates
// /admin/* via proxy.ts.

export default async function BookAdminPage() {
  const book = await getBook();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <Link
        href="/admin/desk"
        className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
        style={{ fontSize: "0.65rem", fontWeight: 500 }}
      >
        &larr; Writer&apos;s Desk
      </Link>

      <h1
        className="font-display text-ink leading-tight tracking-tight mt-4 mb-3"
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        The book
      </h1>

      <p
        className="font-serif italic text-ink-muted mb-10 leading-relaxed"
        style={{ fontSize: "1rem" }}
      >
        Single record. Edits land on the /book page and the widget
        panel immediately. Optional sections (excerpt, chapters,
        pre-order URL) hide automatically when their fields are empty.
      </p>

      <BookAdminForm initial={book} />
    </div>
  );
}
