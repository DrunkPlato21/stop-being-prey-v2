"use client";

import { useEffect, useRef, useState } from "react";
import { AutoResizingTextarea } from "@/components/AutoResizingTextarea";

// Admin control for scheduled lounge prompts — the conversation
// starter + drip. Self-contained: pulls the pending queue from
// /api/admin/lounge-prompts, lets Clay paste a batch of prompts and a
// drip interval, and shows what's still queued. Lives on the admin
// desk by the Watch Feed controls.
//
// The model: one prompt per line. The first posts on the next poll
// (within seconds) and can be pinned as the night's starter; each
// following line posts `interval` minutes after the one before it, so
// the room keeps getting re-sparked while Clay writes. Prompts post as
// host-authored lounge posts, so they land with the AUTHOR treatment
// and members reply directly to them.

type ScheduledPrompt = {
  id: string;
  text: string;
  pin: boolean;
  revealAt: number;
};

const POLL_INTERVAL_MS = 30_000;
const DEFAULT_INTERVAL_MIN = 25;

function relReveal(revealAt: number, now: number): string {
  const diff = revealAt - now;
  if (diff <= 15_000) return "posting now";
  const min = Math.round(diff / 60_000);
  if (min < 1) return "in under a minute";
  if (min < 60) return `in ${min} min`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `in ${hr}h` : `in ${hr}h ${rem}m`;
}

export function PromptScheduler() {
  const [queue, setQueue] = useState<ScheduledPrompt[]>([]);
  const [draft, setDraft] = useState("");
  const [interval, setIntervalMin] = useState(DEFAULT_INTERVAL_MIN);
  const [pinFirst, setPinFirst] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const cancelledRef = useRef(false);

  async function loadQueue() {
    try {
      const res = await fetch("/api/admin/lounge-prompts", {
        cache: "no-store",
      });
      const data: { ok?: boolean; prompts?: ScheduledPrompt[] } = await res
        .json()
        .catch(() => ({}));
      if (cancelledRef.current) return;
      if (res.ok && data.ok && Array.isArray(data.prompts)) {
        setQueue(data.prompts);
      }
    } catch {
      // Keep last snapshot on a blip.
    }
  }

  useEffect(() => {
    cancelledRef.current = false;
    void loadQueue();
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadQueue();
    }, POLL_INTERVAL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, []);

  const lines = draft
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  async function schedule() {
    if (pending) return;
    if (lines.length === 0) {
      setError("Add at least one prompt (one per line).");
      return;
    }
    setPending(true);
    setError(null);
    const prompts = lines.map((text, i) => ({
      text,
      delayMinutes: i * interval,
      pin: i === 0 && pinFirst,
    }));
    try {
      const res = await fetch("/api/admin/lounge-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts }),
      });
      const data: { ok?: boolean; prompts?: ScheduledPrompt[]; error?: string } =
        await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setDraft("");
        if (Array.isArray(data.prompts)) setQueue(data.prompts);
      } else {
        setError(data.error ?? "Couldn't schedule.");
      }
    } catch {
      setError("Couldn't schedule.");
    } finally {
      setPending(false);
    }
  }

  async function clearAll() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/admin/lounge-prompts", {
        method: "DELETE",
      });
      if (res.ok) setQueue([]);
    } finally {
      setPending(false);
    }
  }

  // Preview the schedule the current draft would produce.
  const previewFirst = lines.length > 0;
  const previewLast =
    lines.length > 1 ? (lines.length - 1) * interval : 0;

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      <div className="flex items-center gap-3 mb-1.5">
        <span
          className={
            queue.length > 0
              ? "desk-status-dot desk-status-dot-active"
              : "desk-status-dot desk-status-dot-quiet"
          }
          aria-hidden="true"
        />
        <span
          className="font-display uppercase text-ink"
          style={{
            fontSize: "0.72rem",
            letterSpacing: "0.24em",
            fontWeight: 600,
          }}
        >
          Conversation prompts
          {queue.length > 0 ? ` · ${queue.length} queued` : ""}
        </span>
      </div>

      <p
        className="font-serif italic text-ink-muted mb-5"
        style={{ fontSize: "0.92rem" }}
      >
        One prompt per line. The first posts right away (pin it as the
        night&apos;s starter); each next line drips in after the interval,
        so the room keeps getting sparked while you write. They post as
        you, and members reply right to them.
      </p>

      <AutoResizingTextarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        disabled={pending}
        minRows={5}
        placeholder={
          "What's a frame someone tried on you this week?\nWho's the best interviewer alive right now, and why?\nDrop a line you wish you'd said in the moment."
        }
        className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink w-full mb-3"
        style={{ fontSize: "1rem", lineHeight: 1.55 }}
      />

      <div className="flex items-center gap-4 flex-wrap mb-3">
        <label className="flex items-center gap-2">
          <span
            className="eyebrow"
            style={{ fontSize: "0.62rem" }}
          >
            Drip every
          </span>
          <input
            type="number"
            min={1}
            max={240}
            value={interval}
            onChange={(e) =>
              setIntervalMin(
                Math.max(1, Math.min(240, Number.parseInt(e.target.value, 10) || 1))
              )
            }
            disabled={pending}
            className="font-serif text-ink bg-paper border border-border px-3 py-2 outline-none focus:border-ink"
            style={{ fontSize: "0.95rem", width: "4.5rem" }}
          />
          <span
            className="font-serif text-ink-muted"
            style={{ fontSize: "0.9rem" }}
          >
            min
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={pinFirst}
            onChange={(e) => setPinFirst(e.target.checked)}
            disabled={pending}
          />
          <span
            className="font-serif text-ink-muted"
            style={{ fontSize: "0.9rem" }}
          >
            Pin the first as the starter
          </span>
        </label>
      </div>

      {previewFirst && (
        <p
          className="font-serif italic text-ink-faint mb-4"
          style={{ fontSize: "0.82rem" }}
        >
          {lines.length === 1
            ? "1 prompt — posts now."
            : `${lines.length} prompts — first now, last ${
                previewLast < 60
                  ? `in ${previewLast} min`
                  : `in ${Math.floor(previewLast / 60)}h ${previewLast % 60}m`
              }.`}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap mb-6">
        <button
          type="button"
          onClick={schedule}
          disabled={pending || lines.length === 0}
          className="btn-primary"
          style={{
            opacity: pending || lines.length === 0 ? 0.6 : 1,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          <span>{pending ? "scheduling…" : "schedule prompts"}</span>
        </button>
        {error && (
          <span
            className="font-serif italic text-sm"
            style={{ color: "#7a3a2e" }}
          >
            {error}
          </span>
        )}
      </div>

      {queue.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="eyebrow" style={{ fontSize: "0.6rem" }}>
              Queued
            </p>
            <button
              type="button"
              onClick={clearAll}
              disabled={pending}
              className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-eye-deep no-underline transition-colors"
              style={{
                fontSize: "0.62rem",
                fontWeight: 500,
                background: "transparent",
                border: 0,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              clear all
            </button>
          </div>
          <ul className="flex flex-col">
            {queue.map((p, idx) => (
              <li
                key={p.id || idx}
                className={idx === 0 ? "py-3" : "py-3 border-t border-rule"}
              >
                <div className="flex items-start justify-between gap-4">
                  <p
                    className="font-serif text-ink leading-relaxed min-w-0 flex-1"
                    style={{ fontSize: "0.95rem" }}
                  >
                    {p.pin && (
                      <span
                        className="font-display uppercase text-eye-deep"
                        style={{
                          fontSize: "0.58rem",
                          letterSpacing: "0.2em",
                          fontWeight: 700,
                          marginRight: "0.5rem",
                        }}
                      >
                        Pin
                      </span>
                    )}
                    {p.text}
                  </p>
                  <span
                    className="font-serif italic text-ink-faint whitespace-nowrap"
                    style={{ fontSize: "0.78rem", paddingTop: "0.1rem" }}
                  >
                    {relReveal(p.revealAt, now)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
