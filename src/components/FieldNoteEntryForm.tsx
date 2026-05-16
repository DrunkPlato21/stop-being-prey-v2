"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// New-entry form for /admin/field-notes/[slug]. POSTs to the admin
// API. Auto-textarea resize keeps the body field comfortable while
// drafting. Markdown is accepted as-is; the detail page renders it
// with the same remark pipeline as essay bodies.

function todayDateInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function FieldNoteEntryForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [date, setDate] = useState(todayDateInputValue());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!title.trim() || !body.trim()) {
      setError("Entry needs a title and a body.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/field-notes/${slug}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title, body }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "save_failed");
        return;
      }
      setTitle("");
      setBody("");
      setDate(todayDateInputValue());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-5">
        <label className="flex flex-col gap-2">
          <span
            className="font-display"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--ink-muted)",
            }}
          >
            Date
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-surface border border-rule px-3 py-2 font-serif text-ink"
            style={{ fontSize: "0.95rem" }}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span
            className="font-display"
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 600,
              color: "var(--ink-muted)",
            }}
          >
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short entry title"
            className="bg-surface border border-rule px-3 py-2 font-display text-ink"
            style={{ fontSize: "1rem", fontWeight: 500 }}
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span
          className="font-display"
          style={{
            fontSize: "0.62rem",
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            fontWeight: 600,
            color: "var(--ink-muted)",
          }}
        >
          Body (markdown)
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.max(8, body.split("\n").length + 2)}
          placeholder="The entry. Paragraphs are separated by blank lines. Lists, emphasis, and links use standard markdown."
          className="bg-surface border border-rule px-3 py-2 font-serif text-ink leading-relaxed"
          style={{ fontSize: "1rem", resize: "vertical" }}
        />
      </label>

      {error && (
        <p
          className="font-serif italic"
          style={{ color: "var(--eye-deep)", fontSize: "0.92rem" }}
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="font-display uppercase transition-colors disabled:opacity-50"
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.22em",
            fontWeight: 600,
            color: "var(--page)",
            background: "var(--eye-deep)",
            padding: "0.65rem 1.1rem",
            border: "1px solid var(--eye-deep)",
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Appending…" : "Append entry"}
        </button>
        <p
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.85rem" }}
        >
          Saves to Redis. Visible on /notes/field-notes/{slug} immediately.
        </p>
      </div>
    </form>
  );
}
