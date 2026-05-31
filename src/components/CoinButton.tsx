"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCoinContext } from "@/components/CoinContext";

// Coins — the scarce endorsement control on a single top-level comment.
//
// State is DERIVED from the shared CoinContext on every render, not
// frozen at mount. That's the whole point: "have I spent my coin on this
// article?" is one shared fact, so the instant a give succeeds anywhere,
// markSpent() flips the context and EVERY CoinButton re-derives in place
// — the funded comment shows its marker, every other give button
// disappears (replaced by the plain read-only count), and the section
// notice updates. No manual refresh, and no click-then-reject: a spent
// member never sees a give button to click.
//
// Derived states (dead-obvious at a glance, audience skews older):
//   "spent-here"     this comment is the one they funded — gold "Your
//                    coin" marker.
//   "spent-elsewhere" coin already spent on another comment — read-only
//                    count, NO button (looks like information, not an
//                    action, so it never invites a failed click).
//   "own"            the member's own comment — count only.
//   "guest"          signed-out / non-member — count only.
//   "unspent"        the one giveable state: gold coin + "Give your coin".
//
// Counts + giver names always show, in every state, for everyone — so a
// spent member can still watch which comment is winning.

export type CoinViewerState =
  | "unspent"
  | "spent-here"
  | "spent-elsewhere"
  | "own"
  | "guest";

type Props = {
  commentId: string;
  count: number;
  topGivers: string[];
  /** True when this comment was authored by the viewer (can't self-coin). */
  isOwn: boolean;
};

const GOLD = "#b8860b"; // var(--eye-deep) family; explicit so the coin reads as metal
const GOLD_SOFT = "#caa53d";

function CoinGlyph({
  size = 18,
  bright = false,
}: {
  size?: number;
  bright?: boolean;
}) {
  // Simple struck-coin glyph: outer ring + inner ring + a center mark.
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bright
          ? `radial-gradient(circle at 35% 30%, ${GOLD_SOFT}, ${GOLD})`
          : "transparent",
        border: `2px solid ${bright ? GOLD : "var(--ink-faint)"}`,
        color: bright ? "#3a2c05" : "var(--ink-faint)",
        fontWeight: 700,
        fontSize: size * 0.62,
        lineHeight: 1,
        fontFamily: "var(--font-display), serif",
        boxShadow: bright ? `inset 0 0 0 2px rgba(255,255,255,0.25)` : "none",
        flexShrink: 0,
      }}
    >
      ◆
    </span>
  );
}

function giversSummary(count: number, names: string[]): string {
  if (count <= 0) return "";
  if (names.length === 0) return count === 1 ? "1 coin" : `${count} coins`;
  if (count === 1) return `${names[0]} gave a coin`;
  const shown = names.slice(0, 2);
  const others = count - shown.length;
  if (others <= 0) {
    return `${shown.join(" and ")} gave coins`;
  }
  return `${shown.join(", ")} and ${others} ${
    others === 1 ? "other" : "others"
  } gave coins`;
}

export function CoinButton({ commentId, count, topGivers, isOwn }: Props) {
  const router = useRouter();
  const { signedIn, spentCommentId, markSpent } = useCoinContext();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [justGave, setJustGave] = useState(false);
  // Optimistic count bump for the comment THIS member just funded. Other
  // comments' counts come straight from the server prop (they don't
  // change when you coin a different comment). A non-null override only
  // ever applies to the funded comment.
  const [countOverride, setCountOverride] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localCount = countOverride ?? count;
  const summary = giversSummary(localCount, topGivers);

  // Derive the viewer state from shared context every render — this is
  // what makes a give propagate to every button instantly.
  const localState: CoinViewerState = !signedIn
    ? "guest"
    : spentCommentId === commentId
      ? "spent-here"
      : isOwn
        ? "own"
        : spentCommentId
          ? "spent-elsewhere"
          : "unspent";

  async function commit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/coins/give", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        count?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        if (data.error === "already_spent") {
          setError("You already gave your coin for this piece.");
        } else if (data.error === "self_coin") {
          setError("You can't coin your own comment.");
        } else {
          setError("Couldn't give your coin. Try again.");
        }
        setPending(false);
        setArmed(false);
        return;
      }
      // Optimistic, instant, everywhere: bump this comment's count and
      // flip the SHARED spent state. markSpent() re-renders every other
      // CoinButton — their give buttons vanish, the notice updates — with
      // no page refresh. We then fire a background router.refresh() purely
      // to re-sort the list by the new counts server-side; the visible
      // state is already correct before it lands, so even if it's slow
      // nothing looks broken.
      setCountOverride(
        typeof data.count === "number" ? data.count : localCount + 1
      );
      markSpent(commentId);
      setArmed(false);
      setJustGave(true);
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setTimeout(
        () => {
          router.refresh();
        },
        reduceMotion ? 150 : 1100
      );
    } catch {
      setError("Couldn't give your coin. Try again.");
      setPending(false);
      setArmed(false);
    }
  }

  // Scoped animation keyframes — injected here rather than in globals.css
  // so this feature is fully self-contained.
  const styleTag = (
    <style>{`
      @keyframes sbpCoinPop {
        0%   { transform: scale(0.6) rotate(-12deg); opacity: 0; }
        45%  { transform: scale(1.35) rotate(8deg);  opacity: 1; }
        70%  { transform: scale(0.95) rotate(-3deg); }
        100% { transform: scale(1) rotate(0deg);     opacity: 1; }
      }
      @keyframes sbpCoinRise {
        0%   { transform: translateY(0);    opacity: 0; }
        25%  { opacity: 1; }
        100% { transform: translateY(-22px); opacity: 0; }
      }
      .sbp-coin-pop { animation: sbpCoinPop 0.7s cubic-bezier(.2,.9,.3,1.4) both; }
      .sbp-coin-rise {
        position: absolute; left: 0; top: 0;
        animation: sbpCoinRise 1s ease-out forwards;
        pointer-events: none;
      }
      /* Older / motion-sensitive readers: no pop, no rising coin — the
         coin simply appears and the count updates. Matches the site-wide
         prefers-reduced-motion handling. */
      @media (prefers-reduced-motion: reduce) {
        .sbp-coin-pop { animation: none; }
        .sbp-coin-rise { animation: none; display: none; }
      }
    `}</style>
  );

  // --- Read-only states: count + summary, no action -----------------
  if (
    localState === "guest" ||
    localState === "own" ||
    localState === "spent-elsewhere"
  ) {
    const bright = localState === "spent-elsewhere" ? false : localCount > 0;
    return (
      <span
        className="inline-flex items-center gap-2"
        title={summary || undefined}
      >
        <CoinGlyph bright={localCount > 0 && bright} />
        <span
          className="font-display"
          style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            color: localCount > 0 ? "var(--ink)" : "var(--ink-faint)",
          }}
        >
          {localCount}
        </span>
        {summary && (
          <span
            className="font-serif italic text-ink-faint hidden sm:inline"
            style={{ fontSize: "0.78rem" }}
          >
            {summary}
          </span>
        )}
      </span>
    );
  }

  // --- Spent here: this is the comment they funded ------------------
  if (localState === "spent-here") {
    return (
      <span className="inline-flex items-center gap-2 relative">
        {justGave && styleTag}
        <span className={justGave ? "sbp-coin-pop" : undefined}>
          <CoinGlyph bright size={20} />
        </span>
        {justGave && (
          <span className="sbp-coin-rise" aria-hidden="true">
            <CoinGlyph bright size={20} />
          </span>
        )}
        <span
          className="font-display"
          style={{ fontSize: "0.82rem", fontWeight: 700, color: GOLD }}
        >
          {localCount}
        </span>
        <span
          className="font-display uppercase"
          style={{
            fontSize: "0.62rem",
            fontWeight: 700,
            letterSpacing: "0.18em",
            color: GOLD,
            border: `1px solid ${GOLD}`,
            padding: "0.1rem 0.5rem",
          }}
        >
          ✓ You gave your coin
        </span>
      </span>
    );
  }

  // --- Unspent: the one giveable state -----------------------------
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <CoinGlyph bright={localCount > 0} />
      <span
        className="font-display"
        style={{
          fontSize: "0.82rem",
          fontWeight: 600,
          color: localCount > 0 ? "var(--ink)" : "var(--ink-faint)",
        }}
      >
        {localCount}
      </span>
      {!armed ? (
        <button
          type="button"
          onClick={() => {
            setArmed(true);
            setError(null);
            // Auto-disarm so an accidental tap doesn't sit primed.
            // 12s gives an unhurried reader time to read the warning and
            // decide; an accidental tap still clears itself.
            setTimeout(() => setArmed(false), 12000);
          }}
          className="font-display uppercase tracking-[0.18em] bg-transparent border-0 cursor-pointer p-0 transition-colors"
          style={{ fontSize: "0.7rem", fontWeight: 700, color: GOLD }}
        >
          Give your coin
        </button>
      ) : (
        <span className="inline-flex flex-col gap-1.5">
          <span
            className="font-serif italic text-ink"
            style={{ fontSize: "0.82rem", maxWidth: "22rem" }}
          >
            Give your coin to this comment? You only get one for this
            article, and it can&apos;t be undone.
          </span>
          <span className="inline-flex items-center gap-4">
            <button
              type="button"
              onClick={commit}
              disabled={pending}
              className="font-display uppercase tracking-[0.18em] bg-transparent border-0 cursor-pointer p-0 transition-colors"
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: GOLD,
                opacity: pending ? 0.6 : 1,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              {pending ? "Giving…" : "Yes, give it"}
            </button>
            <button
              type="button"
              onClick={() => {
                setArmed(false);
                setError(null);
              }}
              disabled={pending}
              className="font-display uppercase tracking-[0.18em] text-ink-faint hover:text-ink bg-transparent border-0 cursor-pointer p-0 transition-colors"
              style={{ fontSize: "0.7rem", fontWeight: 500 }}
            >
              Cancel
            </button>
          </span>
        </span>
      )}
      {summary && !armed && (
        <span
          className="font-serif italic text-ink-faint hidden sm:inline"
          style={{ fontSize: "0.78rem" }}
        >
          {summary}
        </span>
      )}
      {error && (
        <span
          className="font-serif italic"
          style={{ fontSize: "0.8rem", color: "#7a3a2e" }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
