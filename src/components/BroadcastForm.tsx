"use client";

import { useState } from "react";

// Tiny admin form to broadcast a new-content notification to every
// active member. Lives in the /admin/desk control surface alongside
// the active-wall + visitors controls.
//
// Used when essays / Field Notes / walls publish — since those live
// on the file system + git deploys, there's no natural webhook to
// trigger the fan-out. Clay fills this in once per publish.

type BroadcastType = "essay" | "wall_opened";

export function BroadcastForm() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BroadcastType>("essay");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!title.trim() || !linkUrl.trim()) {
      setError("Title and link are required.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          body: body.trim(),
          linkUrl: linkUrl.trim(),
        }),
      });
      const data: {
        ok?: boolean;
        sent?: number;
        recipients?: number;
        error?: string;
      } = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "broadcast_failed");
        return;
      }
      setResult(
        `Sent to ${data.sent ?? 0} of ${data.recipients ?? 0} active members.`
      );
      setTitle("");
      setBody("");
      setLinkUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "broadcast_failed");
    } finally {
      setPending(false);
    }
  }

  const placeholder =
    type === "essay"
      ? {
          title: "New essay: …",
          body: "Short subtitle or excerpt (≤120 chars)",
          link: "/issue-NN or /<slug>",
        }
      : {
          title: "New wall: …",
          body: "One line of context (≤120 chars)",
          link: "/walls/<slug>",
        };

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-3 w-full text-left"
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          marginBottom: open ? "1.25rem" : 0,
        }}
      >
        <span className="desk-status-dot desk-status-dot-quiet" aria-hidden="true" />
        <span
          className="font-display uppercase text-ink flex-1"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            fontWeight: 600,
          }}
        >
          Broadcast new content
        </span>
        <span
          aria-hidden="true"
          className="text-ink-faint"
          style={{
            fontSize: "0.75rem",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          &rsaquo;
        </span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p
            className="font-serif italic text-ink-muted"
            style={{ fontSize: "0.92rem" }}
          >
            Fires a notification to every active member. Use after you
            deploy a new essay, Field Note, or wall.
          </p>

          <div className="flex gap-3">
            {(
              [
                { value: "essay", label: "Essay / Field Note" },
                { value: "wall_opened", label: "Wall opened" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                disabled={pending}
                className="font-display uppercase transition-colors"
                style={{
                  fontSize: "0.66rem",
                  letterSpacing: "0.22em",
                  fontWeight: 600,
                  padding: "0.55rem 0.9rem",
                  background:
                    type === opt.value ? "var(--ink)" : "transparent",
                  color: type === opt.value ? "var(--paper)" : "var(--ink)",
                  border: "1px solid var(--ink)",
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="eyebrow block mb-2">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              maxLength={80}
              placeholder={placeholder.title}
              disabled={pending}
              required
              className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
              style={{ fontSize: "0.95rem" }}
            />
          </label>

          <label className="block">
            <span className="eyebrow block mb-2">Body / excerpt</span>
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 120))}
              maxLength={120}
              placeholder={placeholder.body}
              disabled={pending}
              className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
              style={{ fontSize: "0.95rem" }}
            />
          </label>

          <label className="block">
            <span className="eyebrow block mb-2">Link</span>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={placeholder.link}
              disabled={pending}
              required
              className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full"
              style={{ fontSize: "0.95rem" }}
            />
          </label>

          <div className="flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={pending}
              className="btn-secondary"
              style={{
                opacity: pending ? 0.6 : 1,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              <span>{pending ? "broadcasting…" : "broadcast"}</span>
            </button>
          </div>

          {result && (
            <p
              className="font-serif italic text-eye-deep"
              style={{ fontSize: "0.88rem" }}
            >
              {result}
            </p>
          )}
          {error && (
            <p
              className="font-serif italic"
              style={{ color: "#7a3a2e", fontSize: "0.88rem" }}
            >
              Couldn&apos;t broadcast: {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
