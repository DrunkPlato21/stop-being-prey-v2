"use client";

import { useState } from "react";
import { ReactionIcon, REACTION_LABELS } from "@/components/ReactionIcon";
import { GUILD_REACTIONS, type GuildReaction } from "@/lib/guild-constants";
import type { ReactionSummary } from "@/lib/guild";

// Reaction bar under a Guild thread or reply. Shows existing reaction
// chips (glyph + count) and a "React" trigger that opens the five-glyph
// picker. Optimistic: the tap updates local state instantly, then the
// server's authoritative summary reconciles (or reverts on failure).
// One reaction per member per target; tapping your own toggles it off.

function applyOptimistic(
  prev: ReactionSummary,
  r: GuildReaction
): ReactionSummary {
  const counts: Partial<Record<GuildReaction, number>> = { ...prev.counts };
  let myReaction: GuildReaction | null = prev.myReaction;

  const dec = (k: GuildReaction) => {
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

const triggerStyle: React.CSSProperties = {
  background: "transparent",
  border: 0,
  padding: 0,
  cursor: "pointer",
  fontSize: "0.64rem",
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--eye-deep)",
};

export function GuildReactions({
  kind,
  targetId,
  threadId,
  initial,
}: {
  kind: "thread" | "reply";
  targetId: string;
  threadId: string;
  initial: ReactionSummary;
}) {
  const [summary, setSummary] = useState<ReactionSummary>(initial);
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState(false);

  async function react(r: GuildReaction) {
    if (pending) return;
    const prev = summary;
    setSummary(applyOptimistic(prev, r));
    setPicking(false);
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

  const reacted = GUILD_REACTIONS.filter((r) => (summary.counts[r] ?? 0) > 0);

  return (
    <div className="flex items-center gap-2 flex-wrap mt-2.5">
      {reacted.map((r) => {
        const mine = summary.myReaction === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => react(r)}
            title={REACTION_LABELS[r]}
            aria-label={`${REACTION_LABELS[r]}, ${summary.counts[r]}`}
            aria-pressed={mine}
            className="inline-flex items-center gap-1 transition-colors"
            style={{
              background: mine ? "rgba(138, 125, 32, 0.1)" : "transparent",
              border: `1px solid ${mine ? "var(--eye-deep)" : "var(--rule)"}`,
              borderRadius: 999,
              padding: "0.12rem 0.5rem 0.12rem 0.4rem",
              cursor: "pointer",
            }}
          >
            <ReactionIcon type={r} size={15} />
            <span
              className="font-display"
              style={{
                fontSize: "0.74rem",
                fontWeight: 600,
                color: mine ? "var(--eye-deep)" : "var(--ink-muted)",
              }}
            >
              {summary.counts[r]}
            </span>
          </button>
        );
      })}

      {picking ? (
        <span className="inline-flex items-center gap-2">
          {GUILD_REACTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => react(r)}
              title={REACTION_LABELS[r]}
              aria-label={REACTION_LABELS[r]}
              className="reaction-button"
              data-type={r}
              data-active={summary.myReaction === r ? "true" : "false"}
            >
              <ReactionIcon type={r} size={22} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            aria-label="Close reactions"
            style={{ ...triggerStyle, color: "var(--ink-faint)" }}
          >
            &times;
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          style={triggerStyle}
          aria-label="React"
        >
          {reacted.length > 0 ? "+" : "React"}
        </button>
      )}
    </div>
  );
}
