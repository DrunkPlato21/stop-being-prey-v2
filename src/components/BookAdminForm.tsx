"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOOK_STATUSES,
  statusLabel,
  type BookMeta,
  type BookStatus,
  type ChapterEntry,
} from "@/lib/book";
import { BookCover } from "@/components/BookCover";

// Single admin editor for the book record. All fields are optional
// to save individually; the API merges patches, so leaving a field
// alone keeps its prior value. Cover upload goes through its own
// multipart endpoint.

export function BookAdminForm({ initial }: { initial: BookMeta }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [book, setBook] = useState<BookMeta>(initial);
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [status, setStatus] = useState<BookStatus>(initial.status);
  const [description, setDescription] = useState(initial.description);
  const [excerpt, setExcerpt] = useState(initial.excerpt ?? "");
  const [preorderUrl, setPreorderUrl] = useState(initial.preorderUrl ?? "");
  const [chapters, setChapters] = useState<ChapterEntry[]>(
    initial.chapters ?? []
  );

  const [savingMeta, setSavingMeta] = useState(false);
  const [savingCover, setSavingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function saveMeta() {
    if (savingMeta) return;
    setSavingMeta(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle,
          status,
          description,
          excerpt: excerpt.trim().length > 0 ? excerpt : null,
          preorderUrl:
            preorderUrl.trim().length > 0 ? preorderUrl.trim() : null,
          chapters: chapters.length > 0 ? chapters : null,
        }),
      });
      const data: { ok?: boolean; book?: BookMeta; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.book) {
        setError(data.error ?? "save_failed");
        return;
      }
      setBook(data.book);
      setNotice("Saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setSavingMeta(false);
    }
  }

  async function uploadCover(file: File) {
    if (savingCover) return;
    setSavingCover(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/book/cover", {
        method: "POST",
        body: form,
      });
      const data: { ok?: boolean; book?: BookMeta; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.book) {
        setError(data.error ?? "upload_failed");
        return;
      }
      setBook(data.book);
      setNotice("Cover uploaded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload_failed");
    } finally {
      setSavingCover(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearCover() {
    if (savingCover) return;
    if (!confirm("Remove the current cover?")) return;
    setSavingCover(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverUrl: null }),
      });
      const data: { ok?: boolean; book?: BookMeta } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok && data.book) {
        setBook(data.book);
        router.refresh();
      }
    } finally {
      setSavingCover(false);
    }
  }

  function addChapter() {
    setChapters((prev) => [...prev, { title: "", status: "" }]);
  }
  function updateChapter(i: number, patch: Partial<ChapterEntry>) {
    setChapters((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  }
  function removeChapter(i: number) {
    setChapters((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Cover */}
      <section>
        <h2
          className="font-display text-ink mb-4"
          style={{ fontSize: "1.05rem", fontWeight: 700 }}
        >
          Cover
        </h2>
        <div className="flex items-start gap-6 flex-wrap">
          <BookCover
            coverUrl={book.coverUrl}
            title={book.title}
            size="thumb"
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadCover(f);
              }}
              disabled={savingCover}
            />
            <p
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.82rem" }}
            >
              PNG, JPG, WebP, or GIF. Max 5 MB.
            </p>
            {book.coverUrl && (
              <button
                type="button"
                onClick={clearCover}
                disabled={savingCover}
                className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors self-start mt-2"
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  cursor: savingCover ? "wait" : "pointer",
                  padding: 0,
                }}
              >
                remove cover
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Text fields */}
      <section className="flex flex-col gap-5">
        <h2
          className="font-display text-ink"
          style={{ fontSize: "1.05rem", fontWeight: 700 }}
        >
          Details
        </h2>

        <label className="block">
          <span className="eyebrow block mb-2">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            maxLength={120}
            disabled={savingMeta}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          />
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">Subtitle</span>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value.slice(0, 200))}
            maxLength={200}
            placeholder="One line under the title. Optional."
            disabled={savingMeta}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          />
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BookStatus)}
            disabled={savingMeta}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          >
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">Description</span>
          <textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value.slice(0, 12000))
            }
            rows={10}
            maxLength={12000}
            placeholder="3 to 5 paragraphs. Plain text with double newlines for paragraph breaks."
            disabled={savingMeta}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y w-full"
            style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
          />
          <p
            className="font-serif italic text-ink-faint mt-2"
            style={{ fontSize: "0.78rem" }}
          >
            {description.length} / 12,000
          </p>
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">
            Excerpt / sample chapter (optional)
          </span>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value.slice(0, 20000))}
            rows={8}
            maxLength={20000}
            placeholder="Leave blank to hide the excerpt section on the page."
            disabled={savingMeta}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y w-full"
            style={{ fontSize: "0.95rem", lineHeight: 1.55 }}
          />
        </label>

        <label className="block">
          <span className="eyebrow block mb-2">
            Pre-order URL (optional)
          </span>
          <input
            type="url"
            value={preorderUrl}
            onChange={(e) => setPreorderUrl(e.target.value)}
            placeholder="https://..."
            disabled={savingMeta}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
            style={{ fontSize: "0.95rem" }}
          />
        </label>
      </section>

      {/* Chapter list */}
      <section>
        <div className="flex items-baseline justify-between gap-4 mb-4">
          <h2
            className="font-display text-ink"
            style={{ fontSize: "1.05rem", fontWeight: 700 }}
          >
            Chapters (optional)
          </h2>
          <button
            type="button"
            onClick={addChapter}
            className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink transition-colors"
            style={{
              fontSize: "0.62rem",
              fontWeight: 600,
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 0,
            }}
          >
            + add chapter
          </button>
        </div>
        {chapters.length === 0 ? (
          <p
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.88rem" }}
          >
            No chapters listed. The page section hides until you add
            at least one.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {chapters.map((c, i) => (
              <li key={i} className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={c.title}
                  onChange={(e) =>
                    updateChapter(i, { title: e.target.value })
                  }
                  placeholder="Chapter title"
                  className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink flex-1 min-w-[200px]"
                  style={{ fontSize: "0.95rem" }}
                />
                <input
                  type="text"
                  value={c.status}
                  onChange={(e) =>
                    updateChapter(i, { status: e.target.value })
                  }
                  placeholder="Status (e.g. drafted)"
                  className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink"
                  style={{
                    fontSize: "0.9rem",
                    minWidth: 140,
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeChapter(i)}
                  className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep transition-colors"
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 500,
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    padding: "0 0.25rem",
                  }}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Save */}
      <div className="flex items-center justify-between gap-4 flex-wrap pt-2 border-t border-rule">
        {notice ? (
          <p
            className="font-serif italic text-eye-deep"
            style={{ fontSize: "0.92rem" }}
          >
            {notice}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={saveMeta}
          disabled={savingMeta}
          className="btn-primary"
          style={{
            opacity: savingMeta ? 0.6 : 1,
            cursor: savingMeta ? "wait" : "pointer",
          }}
        >
          <span>{savingMeta ? "saving..." : "Save book details"}</span>
        </button>
      </div>

      {error && (
        <p
          className="font-serif italic"
          style={{ color: "#7a3a2e", fontSize: "0.92rem" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
