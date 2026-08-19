"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClayReaction, Note, NoteStatus } from "@/lib/notes";
import { MAX_REPLY } from "@/lib/notes-constants";
import { REACTION_LABELS, ReactionIcon } from "@/components/ReactionIcon";

const REACTIONS: ClayReaction[] = [
  "heart",
  "thumb",
  "laugh",
  "shock",
  "fire",
];

// Per-note row in /admin/notes. Header (sender + status), body,
// optional Clay reply if already sent, and inline action bar:
// reply / mark-read / archive (or restore) / Convert to Field Note.
//
// Visibility is no longer surfaced — every note is public.
//
// The reply cap is imported, not redeclared. This file carried its own
// copy of the number, so the counter here and the server's slice could
// disagree without anything failing loudly.

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminNoteRow({ note: initialNote }: { note: Note }) {
  const router = useRouter();
  const [note, setNote] = useState<Note>(initialNote);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState<string>(
    initialNote.clayReply ?? ""
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  async function changeStatus(next: NoteStatus) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/notes/${note.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data: { note?: Note; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.note) {
        setError(data.error ?? "update_failed");
      } else {
        setNote(data.note);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function toggleReaction(reaction: ClayReaction) {
    if (pending) return;
    // Tap the same reaction again to clear; otherwise set/replace.
    const next = note.clayReaction === reaction ? null : reaction;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/notes/${note.id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: next }),
      });
      const data: { note?: Note; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.note) {
        setError(data.error ?? "react_failed");
      } else {
        setNote(data.note);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  async function submitReply() {
    if (pending || !replyDraft.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/notes/${note.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft }),
      });
      const data: { note?: Note; error?: string; email?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.note) {
        setError(data.error ?? "reply_failed");
      } else {
        setNote(data.note);
        setReplyOpen(false);
        // Reply saved but the email didn't go out — say so, or a
        // never-signs-in member silently never sees the reply.
        if (data.email === "failed") {
          setError(
            "Reply saved, but the email to the member failed to send. Check Resend."
          );
        }
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="font-display text-ink"
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {note.fromName || note.fromEmail}
          </span>
          <span
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.78rem" }}
          >
            {note.fromEmail} · {formatTimestamp(note.createdAt)}
          </span>
        </div>
        <Tag
          label={note.status}
          color={
            note.status === "new"
              ? "var(--eye-deep)"
              : note.status === "replied"
                ? "var(--ink)"
                : "var(--ink-faint)"
          }
          highlight={note.status === "new"}
        />
      </div>

      {/* Body */}
      <p
        className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
        style={{ fontSize: "1rem" }}
      >
        {note.body}
      </p>

      {/* Existing reply (with reaction inline next to byline when set) */}
      {note.clayReply && note.clayRepliedAt && (
        <div
          className="mt-4 pl-4"
          style={{ borderLeft: "2px solid var(--eye-deep)" }}
        >
          <p
            className="font-display uppercase mb-1 inline-flex items-center gap-1.5"
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.22em",
              fontWeight: 600,
              color: "var(--eye-deep)",
            }}
          >
            You
            {note.clayReaction && (
              <ReactionIcon type={note.clayReaction} size={14} />
            )}
            replied · {formatTimestamp(note.clayRepliedAt)}
          </p>
          <p
            className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
            style={{ fontSize: "0.95rem" }}
          >
            {note.clayReply}
          </p>
        </div>
      )}

      {/* Reaction-only state (set without a reply yet) */}
      {note.clayReaction && !note.clayReply && (
        <p
          className="font-display uppercase mt-3 inline-flex items-center gap-1.5"
          style={{
            fontSize: "0.6rem",
            letterSpacing: "0.22em",
            fontWeight: 600,
            color: "var(--eye-deep)",
          }}
        >
          You reacted
          <span style={{ color: "var(--eye-deep)" }}>
            <ReactionIcon type={note.clayReaction} size={13} />
          </span>
        </p>
      )}

      {/* Inline reply composer. The cap is MAX_REPLY, which is larger
          than the 150 a member gets: a reply needs more room than the
          question it answers. */}
      {replyOpen && (
        <div className="mt-4">
          <label className="block">
            <span
              className="eyebrow block mb-2"
              style={{ fontSize: "0.62rem" }}
            >
              {note.clayReply ? "Edit reply" : "Reply"}
            </span>
            <textarea
              value={replyDraft}
              onChange={(e) =>
                setReplyDraft(e.target.value.slice(0, MAX_REPLY))
              }
              rows={3}
              maxLength={MAX_REPLY}
              placeholder="Short answer. Sent to them by email."
              disabled={pending}
              className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink resize-y w-full"
              style={{ fontSize: "0.98rem", lineHeight: 1.55 }}
            />
          </label>
          <div className="flex items-center justify-between mt-2 gap-3">
            <span
              className="font-serif italic text-ink-faint"
              style={{ fontSize: "0.78rem" }}
            >
              {replyDraft.length} / {MAX_REPLY} · emailed to the member
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setReplyOpen(false);
                  setReplyDraft(note.clayReply ?? "");
                  setError(null);
                }}
                disabled={pending}
                className="font-display uppercase tracking-[0.22em] text-ink-muted hover:text-ink transition-colors"
                style={{
                  fontSize: "0.62rem",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={submitReply}
                disabled={pending || !replyDraft.trim()}
                className="btn-primary"
                style={{
                  opacity: pending || !replyDraft.trim() ? 0.6 : 1,
                  cursor: pending ? "wait" : "pointer",
                }}
              >
                <span>{pending ? "posting…" : "post reply"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reaction row — its own labeled control group sitting above
          the action bar. Bigger circular buttons (40px) so the
          glyphs actually read; filled-gold active state with a
          satisfying scale-pop animation on transition. Reactions
          and the action bar are separated visually so the reactions
          read as expressive, not as more form chrome. */}
      {!replyOpen && (
        <div className="mt-5 flex items-center gap-4 flex-wrap">
          <p
            className="eyebrow"
            style={{
              letterSpacing: "0.32em",
              fontSize: "0.6rem",
              margin: 0,
            }}
          >
            React
          </p>
          <div className="inline-flex items-center gap-2.5">
            {REACTIONS.map((r) => {
              const active = note.clayReaction === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleReaction(r)}
                  disabled={pending}
                  aria-label={`${REACTION_LABELS[r]}${active ? " (selected)" : ""}`}
                  title={REACTION_LABELS[r]}
                  aria-pressed={active}
                  className="reaction-button"
                  data-type={r}
                  data-active={active ? "true" : "false"}
                >
                  <ReactionIcon type={r} size={26} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action bar */}
      {!replyOpen && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ActionButton
            label={note.clayReply ? "Edit reply" : "Reply"}
            onClick={() => setReplyOpen(true)}
            disabled={pending}
          />
          {note.status !== "read" &&
            note.status !== "replied" &&
            note.status !== "archived" && (
              <ActionButton
                label="Mark read"
                onClick={() => changeStatus("read")}
                disabled={pending}
              />
            )}
          {note.status === "archived" ? (
            <ActionButton
              label="Restore"
              onClick={() => changeStatus("read")}
              disabled={pending}
            />
          ) : (
            <ActionButton
              label="Archive"
              onClick={() => changeStatus("archived")}
              disabled={pending}
            />
          )}
          <ActionButton
            label="Convert to Field Note"
            onClick={() => setConvertOpen(true)}
            disabled={pending}
            highlight
          />
        </div>
      )}

      {error && (
        <p
          className="font-serif italic text-sm mt-3"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}

      {convertOpen && (
        <ConvertModal note={note} onClose={() => setConvertOpen(false)} />
      )}
    </div>
  );
}

function Tag({
  label,
  color,
  highlight,
}: {
  label: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <span
      className="font-display uppercase"
      style={{
        fontSize: "0.6rem",
        letterSpacing: "0.22em",
        fontWeight: 600,
        color,
        border: "1px solid",
        borderColor: color,
        padding: "0.08rem 0.45rem",
        background: highlight ? "rgba(184, 168, 44, 0.08)" : "transparent",
      }}
    >
      {label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  highlight,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-display uppercase tracking-[0.22em] no-underline transition-colors"
      style={{
        fontSize: "0.62rem",
        fontWeight: 600,
        color: highlight ? "var(--eye-deep)" : "var(--ink-muted)",
        background: "transparent",
        border: "1px solid",
        borderColor: highlight ? "var(--eye-deep)" : "var(--rule)",
        padding: "0.4rem 0.85rem",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ConvertModal({
  note,
  onClose,
}: {
  note: Note;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = buildFieldNoteMarkdown(note);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked — user can copy manually from the textarea.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{
        background: "rgba(26, 23, 20, 0.55)",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-w-2xl w-full">
        <span className="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-eye pointer-events-none z-10" />
        <span className="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-eye pointer-events-none z-10" />

        <div className="bg-paper border border-border max-h-[85vh] overflow-y-auto overflow-x-hidden welcome-modal-scroll">
          <div className="px-7 py-8">
            <p className="eyebrow mb-3">Convert to Field Note</p>
            <h3
              className="font-display text-ink leading-snug tracking-tight mb-3"
              style={{ fontSize: "1.4rem", fontWeight: 700 }}
            >
              Starter markdown
            </h3>
            <p
              className="font-serif italic text-ink-muted mb-5"
              style={{ fontSize: "0.92rem" }}
            >
              Copy this into a new file under{" "}
              <code>content/field-notes/</code>. Fill in the title,
              number, and doctrine tags.
            </p>

            <textarea
              readOnly
              value={markdown}
              rows={14}
              className="font-mono text-ink bg-surface border border-border px-4 py-3 outline-none w-full"
              style={{ fontSize: "0.82rem", lineHeight: 1.5 }}
            />

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={copyToClipboard}
                className="btn-primary"
              >
                <span>{copied ? "copied" : "copy to clipboard"}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="font-display uppercase tracking-[0.22em] text-ink-muted hover:text-ink transition-colors"
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildFieldNoteMarkdown(note: Note): string {
  const reply = note.clayReply ?? "";
  const date = new Date(note.createdAt).toISOString().slice(0, 10);
  const frontmatter = [
    "---",
    'title: "TBD — title from your reply"',
    "number: TBD",
    `date: ${date}`,
    "doctrine_tags: []",
    "---",
    "",
  ].join("\n");
  const intro =
    `A reader (${note.fromName || "a member"}) left this on the desk:\n\n` +
    `> ${note.body.replace(/\n/g, "\n> ")}\n\n`;
  const body =
    reply.length > 0
      ? `Here's what I told them.\n\n${reply}\n`
      : `[Reply not yet written]\n`;
  return frontmatter + intro + body;
}
