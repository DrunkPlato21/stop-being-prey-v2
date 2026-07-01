"use client";

import { useEffect, useRef, useState } from "react";
import {
  REACTION_EMOJI,
  REACTION_KEYS,
  REACTION_LABEL,
  type ReactionKey,
} from "@/lib/lounge";
import type { ReactionSummary } from "@/lib/guild";
import { ReactorsPopover } from "@/components/ReactorsPopover";

// Reaction control for a Guild thread or reply. This is the Lounge's
// ReactionControl, cloned: the same seven emoji, the same inline "React"
// trigger, the same hover-open popover picker and summary cluster. The
// only difference is the storage target (Guild threads/replies). One
// reaction per member per target; tapping your own toggles it off.
// Optimistic — taps update instantly, then the server summary reconciles.

const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 280;

function applyOptimistic(
  prev: ReactionSummary,
  r: ReactionKey
): ReactionSummary {
  const counts: Partial<Record<ReactionKey, number>> = { ...prev.counts };
  let myReaction: ReactionKey | null = prev.myReaction;
  const dec = (k: ReactionKey) => {
    const next = (counts[k] ?? 1) - 1;
    if (next <= 0) delete counts[k];
    else counts[k] = next;
  };
  if (prev.myReaction === r) {
    dec(r);
    myReaction = null;
  } else {
    if (prev.myReaction) dec(prev.myReaction);
    counts[r] = (counts[r] ?? 0) + 1;
    myReaction = r;
  }
  const total = (Object.values(counts) as number[]).reduce(
    (a, b) => a + (b ?? 0),
    0
  );
  return { counts, total, myReaction };
}

export function GuildReactions({
  kind,
  targetId,
  threadId,
  initial,
  prominent,
}: {
  kind: "thread" | "reply";
  targetId: string;
  threadId: string;
  initial: ReactionSummary;
  // On the original post the trigger steps up a register so it isn't lost
  // beside the Reply button: bigger, and olive even before you've reacted.
  // Replies leave this off and stay whisper-quiet.
  prominent?: boolean;
}) {
  const [summary, setSummary] = useState<ReactionSummary>(initial);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const mine = summary.myReaction;
  const hasReaction = mine !== null;

  function clearTimers() {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function handleEnter() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) return;
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => {
      setOpen(true);
      openTimer.current = null;
    }, OPEN_DELAY_MS);
  }

  function handleLeave() {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (!open) return;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY_MS);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimers(), []);

  async function react(r: ReactionKey) {
    if (pending) return;
    const prev = summary;
    setSummary(applyOptimistic(prev, r));
    setOpen(false);
    setPending(true);
    try {
      const res = await fetch("/api/guild/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId, threadId, reaction: r }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as {
        summary?: ReactionSummary;
      } | null;
      if (res.ok && data?.summary) setSummary(data.summary);
      else setSummary(prev);
    } catch {
      setSummary(prev);
    } finally {
      setPending(false);
    }
  }

  // Quiet by default (faint until you react); on the OP it reads olive from
  // the start so it's a visible second action, not a footnote.
  const triggerColor = hasReaction || prominent
    ? "var(--eye-deep)"
    : "var(--ink-faint)";

  return (
    <div
      ref={rootRef}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-display uppercase tracking-[0.16em] transition-colors"
        style={{
          fontSize: prominent ? "0.72rem" : "0.64rem",
          fontWeight: 600,
          lineHeight: 1,
          background: "transparent",
          border: 0,
          color: triggerColor,
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          hasReaction ? `Your reaction: ${REACTION_LABEL[mine]}` : "Add a reaction"
        }
      >
        {hasReaction && (
          <span aria-hidden="true" style={{ fontSize: "1.05rem", lineHeight: 1 }}>
            {REACTION_EMOJI[mine]}
          </span>
        )}
        <span>{hasReaction ? REACTION_LABEL[mine] : "React"}</span>
      </button>

      {summary.total > 0 && !(hasReaction && summary.total === 1) && (
        <ReactorsPopover
          endpoint={`/api/guild/reactors?targetId=${targetId}`}
          counts={summary.counts}
          total={summary.total}
        />
      )}

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            display: "inline-flex",
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            boxShadow: "0 6px 22px rgba(26, 23, 20, 0.12)",
            padding: "0.35rem 0.45rem",
            gap: "0.2rem",
          }}
        >
          {REACTION_KEYS.map((key) => {
            const isMine = mine === key;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => react(key)}
                aria-pressed={isMine}
                title={REACTION_LABEL[key]}
                aria-label={REACTION_LABEL[key]}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "2rem",
                  height: "2rem",
                  fontSize: "1.25rem",
                  lineHeight: 1,
                  background: isMine ? "rgba(184, 168, 44, 0.18)" : "transparent",
                  border: 0,
                  cursor: "pointer",
                  borderRadius: 2,
                  transition: "transform 0.12s ease, background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1.18)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1)";
                }}
              >
                <span aria-hidden="true">{REACTION_EMOJI[key]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
