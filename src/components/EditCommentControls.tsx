"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AutoResizingTextarea } from "@/components/AutoResizingTextarea";

// 5-minute edit window control. Used for both top-level comments
// (POST /api/comments/:id/edit) and member-to-member thread replies
// (PATCH /api/comments/:id/thread-reply/:replyId). The caller supplies
// the endpoint + method.
//
// Renders as a small italic olive "Edit" link in the actions row;
// click expands an inline textarea pre-populated with the current
// body. Hides itself once the window expires (local timer refreshes
// state every 10s without a page reload).

const EDIT_WINDOW_MS = 5 * 60 * 1000;

const ERRORS: Record<string, string> = {
  empty_body: "Body can't be empty.",
  edit_window_expired: "The 5-minute edit window has passed.",
  forbidden: "Not yours to edit.",
  not_found: "Already gone.",
  storage_unavailable: "Storage is temporarily down. Try again.",
};

type Props = {
  /** Backwards-compat with the original API. When `endpoint` is not
      provided we hit POST /api/comments/:commentId/edit. */
  commentId?: string;
  /** Full path to the edit endpoint. Overrides commentId-based default. */
  endpoint?: string;
  method?: "POST" | "PATCH";
  initialBody: string;
  createdAt: number;
};

export function EditCommentControls({
  commentId,
  endpoint,
  method = "POST",
  initialBody,
  createdAt,
}: Props) {
  const targetUrl =
    endpoint ?? (commentId ? `/api/comments/${commentId}/edit` : null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialBody);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Refresh the "now" reading every 10s so the link disappears in
  // real time at the 5-minute mark. We could be exact (set a single
  // timeout to the deadline) but 10s granularity is fine here.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [open]);

  const remainingMs = createdAt + EDIT_WINDOW_MS - now;
  if (remainingMs <= 0) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !targetUrl) return;
    if (!value.trim()) {
      setError(ERRORS.empty_body);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(targetUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(
          (data.error && ERRORS[data.error]) || "Couldn't save. Try again."
        );
        setPending(false);
        return;
      }
      setOpen(false);
      setPending(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(initialBody);
          setOpen(true);
          setError(null);
        }}
        className="font-serif italic bg-transparent border-0 cursor-pointer p-0 transition-colors"
        style={{
          fontSize: "0.85rem",
          color: "var(--eye-deep)",
        }}
      >
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full mt-3 flex flex-col gap-2">
      <AutoResizingTextarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        minRows={4}
        maxLength={1500}
        disabled={pending}
        className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink"
        style={{ fontSize: "1rem", lineHeight: 1.55 }}
      />
      <span
        className="font-serif italic text-ink-faint self-end"
        style={{ fontSize: "0.78rem" }}
      >
        {value.length} / 1500
      </span>
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
          <span>{pending ? "Saving…" : "Save"}</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setValue(initialBody);
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
