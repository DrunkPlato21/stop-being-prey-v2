"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { REACTION_EMOJI, REACTION_LABEL, type ReactionKey } from "@/lib/lounge";
import { setReactionAction, whisperAction } from "@/app/arena/actions";

// The full extent of a member's public voice in the Arena: one wordless
// reaction per tile, Facebook semantics — press React, pick from the
// tray, picking again removes, picking another replaces. The row shows
// only what the tile has actually earned (a cluster of the reactions
// present plus the count), never a menu of empty buttons. The whisper
// is the private channel: only Clay reads it, and the room hears it
// only if he quotes it into a later tile. No comments, by design.

const ARENA_REACTIONS: ReactionKey[] = [
  "like",
  "love",
  "fire",
  "laugh",
  "wow",
  "hundred",
];

export function TileEngage({
  tileId,
  counts,
  mine,
}: {
  tileId: string;
  counts: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey | null;
}) {
  const [local, setLocal] = useState(counts);
  const [my, setMy] = useState<ReactionKey | null>(mine);
  const [trayOpen, setTrayOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [whispering, setWhispering] = useState(false);
  const [sent, setSent] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Tap-away closes the tray.
  useEffect(() => {
    if (!trayOpen) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setTrayOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [trayOpen]);

  function choose(key: ReactionKey) {
    // Optimistic, mirroring the server's toggle-or-replace semantics.
    setLocal((prev) => {
      const next = { ...prev };
      if (my) next[my] = Math.max(0, (next[my] ?? 1) - 1);
      if (my !== key) next[key] = (next[key] ?? 0) + 1;
      return next;
    });
    setMy((cur) => (cur === key ? null : key));
    if (my !== key) setBurst((b) => b + 1);
    setTrayOpen(false);
    startTransition(() => {
      void setReactionAction(tileId, key);
    });
  }

  const present = ARENA_REACTIONS.filter((k) => (local[k] ?? 0) > 0);
  const total = present.reduce((sum, k) => sum + (local[k] ?? 0), 0);

  return (
    <>
      <div className="arena-engage" ref={rootRef}>
        {total > 0 && (
          <span className="arena-sum" key={burst}>
            <span className="arena-sum-emoji">
              {present
                .sort((a, b) => (local[b] ?? 0) - (local[a] ?? 0))
                .slice(0, 3)
                .map((k) => (
                  <span key={k}>{REACTION_EMOJI[k]}</span>
                ))}
            </span>
            <span className="n">{total}</span>
          </span>
        )}

        <span className="arena-react-anchor">
          {trayOpen && (
            <span className="arena-tray" role="menu">
              {ARENA_REACTIONS.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  title={REACTION_LABEL[k]}
                  aria-label={REACTION_LABEL[k]}
                  className={`arena-tray-btn${my === k ? " mine" : ""}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => choose(k)}
                >
                  {REACTION_EMOJI[k]}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            className={`arena-react-main${my ? " hit" : ""}`}
            aria-expanded={trayOpen}
            onClick={() => setTrayOpen((o) => !o)}
          >
            {my ? (
              <span className="chosen" key={burst}>
                {REACTION_EMOJI[my]} {REACTION_LABEL[my]}
              </span>
            ) : (
              <span>React</span>
            )}
          </button>
        </span>

        <button
          type="button"
          className="arena-whisper-btn"
          onClick={() => setWhispering((w) => !w)}
        >
          Whisper
        </button>
      </div>

      {whispering && !sent && (
        <form
          className="arena-whisper-box"
          action={async (formData: FormData) => {
            await whisperAction(formData);
            setSent(true);
          }}
        >
          <input type="hidden" name="tileId" value={tileId} />
          <textarea
            name="body"
            required
            maxLength={1200}
            placeholder="Your read. Your counter. Take the rep."
          />
          <div className="arena-whisper-note">
            Only Clay sees this. The room hears you if he quotes you.
          </div>
          <button type="submit" className="arena-whisper-send">
            Whisper it
          </button>
        </form>
      )}
      {sent && <div className="arena-whisper-sent">Whispered. Only Clay heard it.</div>}
    </>
  );
}
