"use client";

import { useMemo, useRef, useState } from "react";
import { ARSENAL_MOVES, findMove } from "@/lib/arsenal";
import { ARENA_MAX_MOVES } from "@/lib/arena-constants";

// Tagging moves from the bench: type a few letters, the Arsenal offers
// matches, click or Enter lands the chip in its color. Free text is
// still allowed on purpose — fights are where new moves get coined, and
// an unnamed (faint) chip is a move waiting for its Library entry.
// Submits as the same comma-separated "moves" field the action already
// parses: canonical picks go over as slugs, free text goes as typed.

// `initial` is what the tile editor passes: the tags already on a
// posted tile, so a fix starts from what's there instead of a blank row.
export function MovePicker({ initial }: { initial?: string[] } = {}) {
  const [tags, setTags] = useState<string[]>(initial ?? []);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ARSENAL_MOVES.filter(
      (m) => m.name.toLowerCase().includes(q) && !tags.includes(m.slug)
    ).slice(0, 6);
  }, [query, tags]);

  function add(tag: string) {
    const t = tag.trim();
    if (!t || tags.length >= ARENA_MAX_MOVES || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length > 0) add(matches[0].slug);
      else if (query.trim()) add(query);
    } else if (e.key === "Backspace" && !query && tags.length > 0) {
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div className="arena-movepicker">
      <input type="hidden" name="moves" value={tags.join(",")} />
      <div className="arena-movepicker-row">
        {tags.map((t) => {
          const move = findMove(t);
          return (
            <button
              key={t}
              type="button"
              className={`arena-chip-move ${move ? move.role : "unnamed"} picked`}
              title="Remove"
              onClick={() => remove(t)}
            >
              {move && (
                <span aria-hidden="true" className="mark">
                  {move.role === "clay" ? "✦" : "◆"}
                </span>
              )}
              {move ? move.name : t}
              <span aria-hidden="true" className="x">
                ×
              </span>
            </button>
          );
        })}
        {tags.length < ARENA_MAX_MOVES && (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={
              tags.length === 0
                ? "Tag the moves. Type to search the Arsenal."
                : "Add another…"
            }
            aria-label="Tag a move"
          />
        )}
      </div>
      {focused && matches.length > 0 && (
        <div className="arena-movepicker-menu" role="listbox">
          {matches.map((m) => (
            <button
              key={m.slug}
              type="button"
              role="option"
              aria-selected="false"
              className={`arena-movepicker-opt ${m.role}`}
              onMouseDown={(e) => {
                e.preventDefault();
                add(m.slug);
              }}
            >
              <span aria-hidden="true" className="mark">
                {m.role === "clay" ? "✦" : "◆"}
              </span>
              {m.name}
            </button>
          ))}
        </div>
      )}
      {focused && query.trim() && matches.length === 0 && (
        <div className="arena-movepicker-hint">
          Not in the Arsenal. Enter tags it as an unnamed move.
        </div>
      )}
    </div>
  );
}
