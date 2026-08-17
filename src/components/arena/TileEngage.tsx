"use client";

import { useState, useTransition } from "react";
import { REACTION_EMOJI, type ReactionKey } from "@/lib/lounge";
import { toggleReactionAction, whisperAction } from "@/app/arena/actions";

// The full extent of a member's public voice in the Arena: wordless
// reactions, per tile. The whisper is the private channel — only Clay
// reads it, and the room hears it only if he quotes it into a later
// tile. There are no comments in the Arena, by design.

// Curated to the room: a fight breakdown earns fire, awe, laughter, a
// perfect score. The gentler Lounge set stays in the Lounge.
const ARENA_REACTIONS: ReactionKey[] = ["fire", "hundred", "wow", "laugh"];

export function TileEngage({
  tileId,
  counts,
  mine,
}: {
  tileId: string;
  counts: Partial<Record<ReactionKey, number>>;
  mine: ReactionKey[];
}) {
  const [local, setLocal] = useState(counts);
  const [hits, setHits] = useState(new Set(mine));
  const [whispering, setWhispering] = useState(false);
  const [sent, setSent] = useState(false);
  const [, startTransition] = useTransition();

  function react(key: ReactionKey) {
    // Optimistic: flip locally, fire the action, let the next natural
    // render reconcile. No polling — calm surface.
    const nextHits = new Set(hits);
    const delta = nextHits.has(key) ? -1 : 1;
    if (delta === 1) nextHits.add(key);
    else nextHits.delete(key);
    setHits(nextHits);
    setLocal((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? 0) + delta) }));
    startTransition(() => {
      void toggleReactionAction(tileId, key);
    });
  }

  return (
    <>
      <div className="arena-engage">
        {ARENA_REACTIONS.map((key) => (
          <button
            key={key}
            type="button"
            className={`arena-react-btn${hits.has(key) ? " hit" : ""}`}
            aria-pressed={hits.has(key)}
            onClick={() => react(key)}
          >
            <span>{REACTION_EMOJI[key]}</span>
            {(local[key] ?? 0) > 0 && <span className="n">{local[key]}</span>}
          </button>
        ))}
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
