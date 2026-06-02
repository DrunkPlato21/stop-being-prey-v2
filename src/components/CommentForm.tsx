"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CommentKind } from "@/lib/comments";
import { MentionAutoResizingTextarea } from "@/components/MentionAutoResizingTextarea";

// Comment input form. Renders the display-name field only for first-
// time commenters (when the server says hasProfile=false). On submit,
// POSTs to /api/comments and refreshes the route so the new comment
// renders server-side without bespoke client state.

const ERRORS: Record<string, string> = {
  not_authenticated: "Sign in first.",
  invalid_body_field: "Add a comment first.",
  display_name_required: "Pick a display name.",
  invalid_display_name: "That display name isn't allowed.",
  reserved: "That name is reserved. Try another.",
  profanity: "That name isn't allowed. Try another.",
  name_taken: "Someone's already using that name. Try another.",
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

// localStorage key prefix for in-progress drafts. Scoped per
// kind+slug so two open tabs on different pieces don't trample each
// other. We deliberately don't key on email — the form is gated by
// the member session anyway, and keying on email would mean a
// shared computer wouldn't recover a draft after a re-auth.
const DRAFT_PREFIX = "sbp:comment-draft:";

function draftKey(kind: CommentKind, slug: string): string {
  return `${DRAFT_PREFIX}${kind}:${slug}`;
}

type Draft = { body: string; displayName?: string };

function loadDraft(key: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (parsed && typeof parsed.body === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveDraft(key: string, draft: Draft): void {
  if (typeof window === "undefined") return;
  try {
    if (!draft.body && !draft.displayName) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // localStorage might be full or denied (private mode) — silently
    // skip, we never block the typing experience over persistence.
  }
}

function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

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
  const [restoredNote, setRestoredNote] = useState<string | null>(null);
  const key = draftKey(kind, slug);
  // Debounce timer for the save effect so we don't write to
  // localStorage on every keystroke.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore any in-progress draft on mount.
  useEffect(() => {
    const existing = loadDraft(key);
    if (!existing) return;
    if (existing.body) setBody(existing.body);
    if (existing.displayName && !hasProfile) {
      setDisplayName(existing.displayName);
    }
    if (existing.body) {
      setRestoredNote("Restored draft.");
    }
  }, [key, hasProfile]);

  // Debounced save on every change. 300ms is short enough that closing
  // a tab mid-thought rarely loses anything, long enough that fast
  // typing doesn't hammer localStorage.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(key, {
        body,
        displayName: hasProfile ? undefined : displayName,
      });
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [body, displayName, hasProfile, key]);

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
      setRestoredNote(null);
      clearDraft(key);
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
            maxLength={30}
            placeholder="How you'll appear (30 char max)"
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
        <MentionAutoResizingTextarea
          id="comment-body"
          value={body}
          onValueChange={setBody}
          minRows={5}
          maxLength={1500}
          placeholder="Make it count. Replies below are unlimited."
          disabled={pending}
          className="w-full font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink"
          style={{ fontSize: "1rem", lineHeight: 1.55 }}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <span
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.8rem" }}
        >
          {body.length} / 1500
        </span>
        <button
          type="submit"
          disabled={pending}
          className="cta-prestige"
          style={{
            opacity: pending ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "Posting…" : "Post comment"}</span>
          <span aria-hidden="true">&rarr;</span>
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
      {restoredNote && !error && (
        <p
          className="font-serif italic"
          style={{ fontSize: "0.82rem", color: "var(--ink-faint)" }}
        >
          {restoredNote}
        </p>
      )}
    </form>
  );
}
