"use client";

import { useState } from "react";
import type { ChamberedNote, DigestRun } from "@/lib/digest";

// The chamber for the weekly digest, on the /admin/desk control
// surface. One optional "note to patrons": load it whenever the mood
// strikes, and the next Sunday digest leads with it and consumes it.
// Empty chamber, the digest sends fine on its automatic floor — this
// panel must never read as a weekly obligation, so the empty state
// says so out loud.
//
// Collapsible like BroadcastForm; the header line always shows whether
// a round is chambered so the state is readable without opening it.

function formatFireTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function DigestChamberPanel({
  initialChamber,
  lastRun,
  nextFireAt,
  previewLines,
}: {
  initialChamber: ChamberedNote | null;
  lastRun: DigestRun | null;
  nextFireAt: number;
  previewLines: string[];
}) {
  const [open, setOpen] = useState(false);
  const [chamber, setChamber] = useState<ChamberedNote | null>(initialChamber);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function postChamber(body: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data: { ok?: boolean; chamber?: ChamberedNote | null; error?: string } =
        await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "save_failed");
        return;
      }
      setChamber(data.chamber ?? null);
      setDraft("");
      setEditing(false);
      setResult(
        data.chamber ? "Loaded. Sunday's digest leads with this." : "Chamber cleared."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setPending(false);
    }
  }

  async function sendTest() {
    if (testPending) return;
    setTestPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/digest/test", { method: "POST" });
      const data: { ok?: boolean; to?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "test_failed");
        return;
      }
      setResult(`Test sent to ${data.to}. Nothing was consumed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "test_failed");
    } finally {
      setTestPending(false);
    }
  }

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
        <span
          className={`desk-status-dot ${chamber ? "desk-status-dot-active" : "desk-status-dot-quiet"}`}
          aria-hidden="true"
        />
        <span
          className="font-display uppercase text-ink flex-1"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            fontWeight: 600,
          }}
        >
          Weekly digest {chamber ? "· note chambered" : "· chamber empty"}
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
        <div className="flex flex-col gap-4">
          <p
            className="font-serif italic text-ink-muted"
            style={{ fontSize: "0.92rem" }}
          >
            The Sunday patron report assembles itself from the desk, the
            rooms, the wall and the archive. It never needs feeding.
            Load a note only when you have something to say to patrons;
            the next send leads with it and spends it.
          </p>

          {/* Current chamber state */}
          {chamber && !editing ? (
            <div>
              <p className="eyebrow mb-2" style={{ fontSize: "0.6rem" }}>
                In the chamber &middot;{" "}
                {new Date(chamber.loadedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p
                className="font-serif text-ink leading-relaxed whitespace-pre-wrap mb-3"
                style={{ fontSize: "0.95rem" }}
              >
                {chamber.body}
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(chamber.body);
                    setEditing(true);
                  }}
                  disabled={pending}
                  className="font-display uppercase text-ink"
                  style={{
                    fontSize: "0.66rem",
                    letterSpacing: "0.22em",
                    fontWeight: 600,
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    cursor: pending ? "wait" : "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: "3px",
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => postChamber("")}
                  disabled={pending}
                  className="font-display uppercase text-ink-muted"
                  style={{
                    fontSize: "0.66rem",
                    letterSpacing: "0.22em",
                    fontWeight: 600,
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    cursor: pending ? "wait" : "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: "3px",
                  }}
                >
                  Clear the chamber
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="block">
                <span className="eyebrow block mb-2">
                  {chamber ? "Replace the note" : "Note to patrons"}
                </span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 1200))}
                  rows={5}
                  maxLength={1200}
                  placeholder="Whenever you feel like it. This is the addressed register, not the ambient one."
                  disabled={pending}
                  className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full resize-y"
                  style={{ fontSize: "0.95rem", lineHeight: 1.6 }}
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setDraft("");
                    }}
                    disabled={pending}
                    className="font-display uppercase text-ink-muted"
                    style={{
                      fontSize: "0.66rem",
                      letterSpacing: "0.22em",
                      fontWeight: 600,
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                    }}
                  >
                    Cancel
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => postChamber(draft)}
                  disabled={pending || !draft.trim()}
                  className="btn-secondary"
                  style={{
                    opacity: pending || !draft.trim() ? 0.6 : 1,
                    cursor: pending ? "wait" : "pointer",
                  }}
                >
                  <span>{pending ? "loading…" : "load the note"}</span>
                </button>
              </div>
            </div>
          )}

          {/* What goes out, and when */}
          <div className="pt-3 border-t border-rule">
            <p className="eyebrow mb-2" style={{ fontSize: "0.6rem" }}>
              Next send &middot; {formatFireTime(nextFireAt)}
            </p>
            <ul className="font-serif text-ink-muted leading-relaxed m-0 pl-4" style={{ fontSize: "0.9rem" }}>
              {previewLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {lastRun && (
              <p
                className="font-serif italic text-ink-faint mt-3"
                style={{ fontSize: "0.82rem" }}
              >
                Last send:{" "}
                {new Date(lastRun.sentAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                &middot; {lastRun.sent} of {lastRun.attempted} delivered
                {lastRun.noteConsumed ? " · led with your note" : ""}
              </p>
            )}
            <div className="mt-4">
              <button
                type="button"
                onClick={sendTest}
                disabled={testPending}
                className="btn-secondary"
                style={{
                  opacity: testPending ? 0.6 : 1,
                  cursor: testPending ? "wait" : "pointer",
                }}
              >
                <span>{testPending ? "sending…" : "send me a test"}</span>
              </button>
            </div>
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
              Couldn&apos;t save: {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
