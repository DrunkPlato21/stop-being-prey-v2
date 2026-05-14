"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Member-to-member reply on a top-level comment. Renders as a small
// italic olive "Reply" link in the actions row; click expands an
// inline textarea below the comment body. Submits to POST
// /api/comments/:id/thread-reply.
//
// Auto-approves on the server (the parent's author was already
// vetted), so the reply renders immediately after refresh.

const ERRORS: Record<string, string> = {
  empty_body: "Reply can't be empty.",
  display_name_required:
    "Pick a display name from your account first.",
  thread_full: "This thread is full.",
  not_found: "Comment is gone.",
  not_authenticated: "Sign in first.",
  storage_unavailable: "Storage is temporarily down. Try again.",
};

type Props = {
  commentId: string;
  // Hides the trigger when the viewer can't post (signed out / no
  // profile). Comments.tsx is the source of truth for visibility.
  disabledReason?: string | null;
};

export function ReplyCommentForm({ commentId, disabledReason }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!value.trim()) {
      setError(ERRORS.empty_body);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/comments/${commentId}/thread-reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: value }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(
          (data.error && ERRORS[data.error]) ||
            "Couldn't post your reply. Try again."
        );
        setPending(false);
        return;
      }
      setValue("");
      setOpen(false);
      setPending(false);
      router.refresh();
    } catch {
      setError("Couldn't post your reply. Try again.");
      setPending(false);
    }
  }

  if (disabledReason) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="font-serif italic bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{
          fontSize: "0.85rem",
          color: "var(--eye-deep)",
        }}
      >
        Reply
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full mt-3 flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        maxLength={1500}
        placeholder="Reply…"
        disabled={pending}
        className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink resize-y"
        style={{ fontSize: "1rem", lineHeight: 1.55 }}
      />
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="cta-prestige"
          style={{
            opacity: pending || !value.trim() ? 0.55 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "Posting…" : "Post reply"}</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setValue("");
          }}
          className="font-display uppercase tracking-[0.2em] text-ink-faint hover:text-ink bg-transparent border-0 cursor-pointer p-0 transition-colors"
          style={{ fontSize: "0.7rem", fontWeight: 500 }}
        >
          cancel
        </button>
        {error && (
          <span
            className="font-serif italic"
            style={{ fontSize: "0.82rem", color: "#7a3a2e" }}
          >
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
