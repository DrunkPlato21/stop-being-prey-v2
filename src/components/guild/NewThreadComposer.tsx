"use client";

import { useActionState, useState } from "react";
import { postThreadAction, type GuildFormState } from "@/app/guild/actions";
import { MAX_BODY, MAX_TITLE } from "@/lib/guild-constants";

const INITIAL: GuildFormState = { ok: false };

// Open-a-thread composer. Collapsed by default so the index reads calm;
// one tap opens it. Low friction: a title, a body, post. On success the
// action redirects into the new thread, so there's no success state to
// handle here.
export function NewThreadComposer() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    postThreadAction,
    INITIAL
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-display uppercase tracking-[0.18em] transition-colors hover:text-ink"
        style={{
          color: "var(--eye-deep)",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: 2,
          padding: "0.7rem 1.2rem",
          fontSize: "0.72rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Open a thread
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="border border-rule"
      style={{ background: "var(--surface)", padding: "1.25rem", borderRadius: 2 }}
    >
      <p
        className="eyebrow"
        style={{ letterSpacing: "0.28em", fontSize: "0.62rem", marginBottom: "0.8rem" }}
      >
        New thread
      </p>
      <input
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
        placeholder="What is this thread about?"
        autoFocus
        className="w-full font-display"
        style={{
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--rule)",
          fontSize: "1.4rem",
          color: "var(--ink)",
          padding: "0.4rem 0",
          marginBottom: "1rem",
          outline: "none",
        }}
      />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        placeholder="Lay out the question or the case. Take the space you need."
        rows={6}
        className="w-full"
        style={{
          background: "transparent",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "1.05rem",
          lineHeight: 1.6,
          color: "var(--ink)",
          padding: "0.8rem",
          outline: "none",
          resize: "vertical",
        }}
      />
      {state.error && (
        <p style={{ color: "var(--blood)", fontSize: "0.85rem", marginTop: "0.6rem" }}>
          {state.error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-display uppercase tracking-[0.18em] text-ink-faint hover:text-ink transition-colors"
          style={{ background: "transparent", border: 0, fontSize: "0.66rem", fontWeight: 600, cursor: "pointer" }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || !title.trim() || !body.trim()}
          className="font-display uppercase tracking-[0.18em] transition-opacity"
          style={{
            background: "var(--eye-deep)",
            color: "var(--surface)",
            border: 0,
            borderRadius: 2,
            padding: "0.6rem 1.4rem",
            fontSize: "0.7rem",
            fontWeight: 600,
            cursor: pending ? "default" : "pointer",
            opacity: pending || !title.trim() || !body.trim() ? 0.5 : 1,
          }}
        >
          {pending ? "Posting…" : "Post thread"}
        </button>
      </div>
    </form>
  );
}
