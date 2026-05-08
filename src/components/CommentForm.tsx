"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommentKind } from "@/lib/comments";

// Comment input form. Renders the display-name field only for first-
// time commenters (when the server says hasProfile=false). On submit,
// POSTs to /api/comments and refreshes the route so the new comment
// renders server-side without bespoke client state.

const ERRORS: Record<string, string> = {
  not_authenticated: "Sign in first.",
  invalid_body_field: "Add a comment first.",
  display_name_required: "Pick a display name.",
  invalid_display_name: "That display name isn't allowed.",
  already_commented: "You've already commented on this piece.",
  empty_body: "Add a comment first.",
  storage_unavailable: "Comments are temporarily unavailable.",
};

type Props = {
  kind: CommentKind;
  slug: string;
  hasProfile: boolean;
  existingDisplayName: string | null;
};

export function CommentForm({
  kind,
  slug,
  hasProfile,
  existingDisplayName,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    if (!body.trim()) {
      setError(ERRORS.empty_body);
      return;
    }
    if (!hasProfile && !displayName.trim()) {
      setError(ERRORS.display_name_required);
      return;
    }

    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          slug,
          body,
          ...(hasProfile ? {} : { displayName }),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(
          (data.error && ERRORS[data.error]) ||
            "Couldn't post your comment. Try again."
        );
        setPending(false);
        return;
      }

      setBody("");
      setDisplayName("");
      router.refresh();
    } catch {
      setError("Couldn't post your comment. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {hasProfile ? (
        <p
          className="font-serif italic text-ink-muted text-center"
          style={{ fontSize: "0.9rem" }}
        >
          Posting as{" "}
          <span className="not-italic text-ink" style={{ fontWeight: 600 }}>
            {existingDisplayName}
          </span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="comment-display-name"
            className="eyebrow"
            style={{ letterSpacing: "0.22em", fontSize: "0.65rem" }}
          >
            Display name
          </label>
          <input
            id="comment-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            placeholder="How you'll appear (40 char max)"
            disabled={pending}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink"
            style={{ fontSize: "1rem" }}
          />
          <p
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.8rem" }}
          >
            Set once. Can be changed later from your account.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="comment-body"
          className="eyebrow"
          style={{ letterSpacing: "0.22em", fontSize: "0.65rem" }}
        >
          Your comment
        </label>
        <textarea
          id="comment-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="One per piece. Make it count."
          disabled={pending}
          className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / 2000
        </span>
        <button type="submit" disabled={pending} className="btn-primary">
          <span>{pending ? "Posting…" : "Post comment"}</span>
        </button>
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
