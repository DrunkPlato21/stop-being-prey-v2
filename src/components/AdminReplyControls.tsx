"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Admin-only controls that sit under each comment when the viewer is
// Clay. Posts to /api/comments/:id/reply (POST or DELETE). Existing
// reply text is shown in the textarea so re-submitting is an edit.

type Props = {
  commentId: string;
  existingReply: string | null;
  /** When true, target the Basic-auth-gated admin endpoint instead
      of the session-gated one. Used on /admin/comments. */
  admin?: boolean;
};

export function AdminReplyControls({
  commentId,
  existingReply,
  admin = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(existingReply ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = admin
    ? `/api/admin/comments/${commentId}/reply`
    : `/api/comments/${commentId}/reply`;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        setError("Couldn't save. Try again.");
        setPending(false);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Couldn't delete reply. Try again.");
        setPending(false);
        return;
      }
      setBody("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't delete reply. Try again.");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-display uppercase tracking-[0.2em] bg-transparent border-0 cursor-pointer p-0 transition-colors"
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "var(--eye-deep)",
          }}
        >
          {existingReply ? "Edit reply" : "Reply"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={8000}
        placeholder="Reply as Clay…"
        disabled={pending}
        className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink resize-y"
        style={{ fontSize: "0.98rem", lineHeight: 1.55 }}
      />
      <span
        className="font-serif italic text-ink-faint self-end"
        style={{ fontSize: "0.78rem" }}
      >
        {body.length} / 8000
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !body.trim()}
          className="btn-primary"
          style={{ padding: "0.55rem 1.1rem", fontSize: "0.7rem" }}
        >
          <span>{pending ? "Saving…" : existingReply ? "Save" : "Post reply"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setBody(existingReply ?? "");
          }}
          disabled={pending}
          className="font-display uppercase tracking-[0.2em] text-ink-muted hover:text-ink bg-transparent border-0 cursor-pointer p-0"
          style={{ fontSize: "0.7rem", fontWeight: 500 }}
        >
          Cancel
        </button>
        {existingReply && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="font-display uppercase tracking-[0.2em] bg-transparent border-0 cursor-pointer p-0 transition-colors ml-auto"
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              color: "#7a3a2e",
            }}
          >
            Delete reply
          </button>
        )}
      </div>
      {error && (
        <p
          className="font-serif italic text-sm"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
