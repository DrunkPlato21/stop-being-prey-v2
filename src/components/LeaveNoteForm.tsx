"use client";

import { useState } from "react";
import type { Note } from "@/lib/notes";

// "Leave a note for Clay" composer. Notes go straight to Clay's
// private inbox — they never appear publicly on the desk or anywhere
// else. Public room talk lives in the Lounge. 150-char cap is the
// forcing function for brevity.

const MAX_BODY = 150;

export function LeaveNoteForm({
  onSubmitted,
  disabled,
  disabledReason,
}: {
  onSubmitted: (note: Note) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<boolean>(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || disabled) return;
    if (!body.trim()) return;

    setPending(true);
    setError(null);
    setConfirm(false);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data: { ok?: boolean; note?: Note; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok || !data.note) {
        setError(data.error ?? "submit_failed");
        setPending(false);
        return;
      }
      setBody("");
      setConfirm(true);
      onSubmitted(data.note);
      setPending(false);
      window.setTimeout(() => setConfirm(false), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submit_failed");
      setPending(false);
    }
  }

  if (disabled) {
    return (
      <p
        className="font-serif italic text-ink-muted leading-relaxed"
        style={{ fontSize: "0.95rem" }}
      >
        {disabledReason ?? "Sign in to leave a note."}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p
        className="font-serif italic text-ink-muted leading-relaxed"
        style={{ fontSize: "0.9rem" }}
      >
        Drop a note here. Clay picks them up when he&apos;s at the desk.
        Private. Just between you and him.
      </p>

      <label className="block">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          rows={3}
          maxLength={MAX_BODY}
          placeholder="Write something for Clay..."
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y w-full"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </label>

      <div className="flex items-center justify-between gap-4">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / {MAX_BODY}
        </span>
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="btn-primary"
          style={{
            opacity: pending || !body.trim() ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "posting..." : "Leave on the desk"}</span>
        </button>
      </div>

      {confirm && (
        <p
          className="font-serif italic text-eye-deep"
          style={{ fontSize: "0.92rem" }}
        >
          Note delivered to Clay&apos;s desk.
        </p>
      )}
      {error && (
        <p
          className="font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          {error === "not_authenticated"
            ? "Sign in first."
            : error === "empty_body"
              ? "Add a note first."
              : error === "admin_self_post"
                ? "Admins can't leave notes for themselves."
                : "Couldn't deliver your note. Try again."}
        </p>
      )}
    </form>
  );
}
