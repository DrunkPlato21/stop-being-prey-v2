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

// The room's own tray, not the site's. "think" and "angry" are offered
// only here: this is the one room where a reaction usually lands on the
// specimen — the opponent's own words — so anger has a real object, and
// "that made me stop and think" is the most useful thing a member can
// say about a read. "cry" is the site's Sad and exists everywhere; the
// Arena had been the one room leaving it out, which is backwards, since
// the subject matter here is the one that actually earns it.
//
// Order follows the reaction set people already have muscle memory for:
// the warm ones first, the two heavy ones last and adjacent. No eyeroll
// on purpose — the stance is workshop, not colosseum, and a sneer
// button is the fastest way to lose it.
const ARENA_REACTIONS: ReactionKey[] = [
  "like",
  "love",
  "fire",
  "laugh",
  "wow",
  "hundred",
  "think",
  "cry",
  "angry",
];

export function TileEngage({
  tileId,
  counts,
  mine,
  sealed = false,
  canEngage = true,
}: {
  tileId: string;
  counts: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey | null;
  // Sealed bout = filed case file. Whispers exist to shape an open bout,
  // so the box closes at the seal; reactions stay — they're part of the
  // record and late readers still get a voice.
  sealed?: boolean;
  // Anonymous readers on a public promotional bout: the earned
  // reactions render as part of the record, but there's nothing to
  // press — engagement belongs to members.
  canEngage?: boolean;
}) {
  const [local, setLocal] = useState(counts);
  const [my, setMy] = useState<ReactionKey | null>(mine);
  const [trayOpen, setTrayOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const [whispering, setWhispering] = useState(false);
  const [sent, setSent] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [lockNote, setLockNote] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Facebook grammar on desktop: hovering the React button opens the
  // tray (after a short intent delay), leaving closes it (with a grace
  // period so the pointer can travel into the tray), and a plain click
  // is the quick toggle. Touch devices keep tap-to-open — hover events
  // there are synthetic and would fight the tap.
  function canHover() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover)").matches
    );
  }
  function hoverEnter() {
    if (!canHover()) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setTrayOpen(true), 300);
  }
  function hoverLeave() {
    if (!canHover()) return;
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setTrayOpen(false), 280);
  }
  useEffect(() => {
    return () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

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

  if (!canEngage) {
    // Public reader: the earned reactions are part of the record, and
    // the React button is deliberately present but locked — pressing it
    // is the strongest conversion moment on the page, so the itch gets
    // the pitch right where it happens.
    return (
      <>
        <div className="arena-engage">
          {total > 0 && (
            <span className="arena-sum">
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
          <button
            type="button"
            className="arena-react-main"
            aria-expanded={lockNote}
            onClick={() => setLockNote((v) => !v)}
          >
            React
          </button>
        </div>
        {lockNote && (
          <div className="arena-lock-note">
            Reactions belong to the room.{" "}
            <a href="/membership?src=arena-react">Take a seat &rarr;</a>
          </div>
        )}
      </>
    );
  }

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

        <span
          className="arena-react-anchor"
          onMouseEnter={hoverEnter}
          onMouseLeave={hoverLeave}
        >
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
            onClick={() => {
              // Desktop, tray already open via hover: click is the
              // Facebook quick toggle (like, or un-react).
              if (canHover() && trayOpen) {
                choose(my ?? "like");
                return;
              }
              setTrayOpen((o) => !o);
            }}
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

        {!sealed && (
          <button
            type="button"
            className="arena-whisper-btn"
            onClick={() => setWhispering((w) => !w)}
          >
            Whisper
          </button>
        )}
      </div>

      {!sealed && whispering && !sent && (
        <form
          className="arena-whisper-box"
          action={async (formData: FormData) => {
            // Honest confirmation only: the action says whether the
            // whisper landed (the bout can seal mid-typing, the tile
            // can be deleted under it), and a dropped one says so.
            const landed = await whisperAction(formData);
            if (landed) setSent(true);
            else setDropped(true);
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
      {dropped && (
        <div className="arena-whisper-sent">
          That one didn&rsquo;t land. The bout closed while you were writing.
        </div>
      )}
    </>
  );
}
