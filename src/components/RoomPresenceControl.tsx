"use client";

import { useEffect, useRef, useState } from "react";

// Admin control for the lounge "who's in the room" indicator. Self-
// contained: pulls its state from /api/admin/lounge-presence on mount,
// polls the live count every 20s, and saves a new floor. Lives on the
// admin desk beside the Watch Feed controls.
//
// There is no on/off switch by design ("auto by threshold"): the
// member-facing line shows itself once the room reaches the floor and
// hides below it, so a thin turnout never leaks. The live count shown
// here is the honest number — visible to the admin regardless of the
// floor — so Clay can calibrate the floor against real turnout. To go
// dark entirely, raise the floor past any plausible turnout.

const POLL_INTERVAL_MS = 20_000;

export function RoomPresenceControl() {
  const [floor, setFloor] = useState<number | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/lounge-presence", {
          cache: "no-store",
        });
        const data: { ok?: boolean; floor?: number; liveTotal?: number } =
          await res.json().catch(() => ({}));
        if (cancelledRef.current) return;
        if (res.ok && data.ok) {
          if (typeof data.floor === "number") {
            setFloor(data.floor);
            // Seed the input once; don't clobber an in-progress edit.
            setDraft((prev) => (prev === "" ? String(data.floor) : prev));
          }
          if (typeof data.liveTotal === "number") setLiveTotal(data.liveTotal);
        }
      } catch {
        // Network blip — keep the last snapshot on screen.
      }
    }

    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(id);
    };
  }, []);

  async function save() {
    const n = Number.parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter a number of 1 or more.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lounge-presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floor: n }),
      });
      const data: { ok?: boolean; floor?: number; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (res.ok && data.ok && typeof data.floor === "number") {
        setFloor(data.floor);
        setDraft(String(data.floor));
        setSavedAt(Date.now());
      } else {
        setError(data.error ?? "Couldn't save.");
      }
    } catch {
      setError("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const dirty = floor !== null && draft.trim() !== String(floor);
  const visibleNow =
    floor !== null && liveTotal !== null && liveTotal >= floor;

  return (
    <div className="mb-10 pb-8 border-b border-rule">
      <div className="flex items-center gap-3 mb-1.5">
        <span
          className={
            visibleNow
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
          Who&apos;s in the room
        </span>
      </div>

      <p
        className="font-serif italic text-ink-muted mb-5"
        style={{ fontSize: "0.92rem" }}
      >
        Members see a live &ldquo;in the room&rdquo; line with names once
        the lounge reaches your floor. Below it, the line stays hidden, so
        a thin room never shows a number. No on/off &mdash; just the floor.
      </p>

      {/* Live readout — the honest count right now, with whether the
          line is currently showing to members. */}
      <div
        className="flex items-baseline gap-4 mb-6 px-5 py-4"
        style={{
          background: "var(--paper-deep)",
          border: "1px solid var(--rule)",
        }}
      >
        <span
          className="font-display text-ink"
          style={{
            fontSize: "2.4rem",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {liveTotal ?? "·"}
        </span>
        <div className="min-w-0">
          <p
            className="font-serif text-ink"
            style={{ fontSize: "0.95rem", lineHeight: 1.3 }}
          >
            in the lounge right now
          </p>
          <p
            className="font-display uppercase mt-1"
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              fontWeight: 700,
              color: visibleNow ? "var(--eye-deep)" : "var(--ink-faint)",
            }}
          >
            {floor === null
              ? "loading…"
              : visibleNow
                ? "Members can see the line"
                : `Hidden · need ${floor} in the room`}
          </p>
        </div>
      </div>

      <label className="block mb-2">
        <span className="eyebrow block mb-2" style={{ fontSize: "0.65rem" }}>
          Show the line at
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="number"
            min={1}
            max={999}
            inputMode="numeric"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSavedAt(null);
              setError(null);
            }}
            disabled={saving}
            className="font-serif text-ink bg-paper border border-border px-4 py-3 outline-none focus:border-ink"
            style={{ fontSize: "1rem", width: "5.5rem" }}
          />
          <span
            className="font-serif text-ink-muted"
            style={{ fontSize: "0.92rem" }}
          >
            or more in the room
          </span>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="btn-primary"
            style={{
              opacity: saving || !dirty ? 0.6 : 1,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            <span>{saving ? "saving…" : "save floor"}</span>
          </button>
          {savedAt !== null && !dirty && (
            <span
              className="font-display uppercase text-eye-deep"
              style={{
                fontSize: "0.6rem",
                letterSpacing: "0.2em",
                fontWeight: 700,
              }}
            >
              Saved
            </span>
          )}
        </div>
      </label>

      {error && (
        <p
          className="font-serif italic text-sm mt-2"
          style={{ color: "#7a3a2e" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
