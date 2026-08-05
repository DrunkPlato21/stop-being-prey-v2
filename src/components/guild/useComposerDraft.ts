"use client";

import { useEffect, useRef, useState } from "react";

// Draft rescue for the Guild composers. The Guild is the long-form room:
// members write for twenty minutes on a phone, and a locked screen, a back
// swipe or a tab reaped in the background used to take the whole post. So
// the draft goes to localStorage as they type, and the next time the
// composer opens the words are simply there.
//
// Restored silently, not behind a "restore?" prompt. A prompt is a manual
// step that asks a member to decide about work they already did. The
// composer just holds what they wrote and says so, with one quiet Discard
// for the case where they didn't want it back.
//
// Deliberately NOT wired into the two edit forms. There the saved post is
// the source of truth, and a stale local draft could silently overwrite a
// later edit made from another device.

const PREFIX = "guild:draft:";

// A draft older than this is almost certainly abandoned, and resurrecting
// it weeks later is a surprise, not a rescue.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Writing on every keystroke would hit localStorage a few hundred times a
// minute. A quarter second after the typing stops is invisible to a member
// and survives everything short of a crash mid-word.
const DEBOUNCE_MS = 250;

export type DraftShape = Record<string, string>;

/**
 * Whatever was stored under `key`, or null. A plain function, not a hook,
 * so a composer can seed its own useState initializers with it.
 *
 * Safe to call during render only because every Guild composer mounts
 * after an interaction (the collapsed "Open a thread" / "Add to the
 * conversation" buttons). Nothing here is ever server-rendered, so a
 * restored value cannot desync hydration.
 */
export function readComposerDraft<T extends DraftShape>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (!parsed?.data || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    // Private mode, quota, or a shape from an older build. A draft is a
    // convenience: it must never be able to break the composer.
    return null;
  }
}

/**
 * Keep `data` saved under `key` while the member types.
 *
 * @param empty     True when there's nothing worth keeping, which drops the
 *                  stored draft, so emptying the box also drops the rescue.
 * @param wasRestored Whether this mount opened with recovered text, which
 *                  is what the Discard notice hangs off.
 */
export function useComposerDraft<T extends DraftShape>(
  key: string,
  data: T,
  empty: boolean,
  wasRestored: boolean
) {
  const [rescued, setRescued] = useState(wasRestored);
  const keyRef = useRef(key);
  keyRef.current = key;
  const dataRef = useRef(data);
  dataRef.current = data;

  // Keyed on the serialized values, not on the object identity the parent
  // rebuilds every render.
  const serialized = JSON.stringify(data);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const k = PREFIX + keyRef.current;
    // An emptied composer drops its draft. That's also what makes Discard
    // work: the caller clears its own fields and this removes the key.
    if (empty) {
      try {
        window.localStorage.removeItem(k);
      } catch {}
      return;
    }
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          k,
          JSON.stringify({ at: Date.now(), data: dataRef.current })
        );
      } catch {}
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [serialized, empty]);

  /** Drop the stored draft and the notice. The caller clears its fields. */
  function clear() {
    try {
      window.localStorage.removeItem(PREFIX + keyRef.current);
    } catch {}
    setRescued(false);
  }

  /**
   * Write the draft back immediately. Used when a post is cleared on
   * submit and the server then rejects it: the words are still on screen,
   * so they have to be still in storage too.
   */
  function saveNow() {
    try {
      window.localStorage.setItem(
        PREFIX + keyRef.current,
        JSON.stringify({ at: Date.now(), data: dataRef.current })
      );
    } catch {}
  }

  return { rescued, clear, saveNow };
}
