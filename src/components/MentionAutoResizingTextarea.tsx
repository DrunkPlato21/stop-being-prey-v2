"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import {
  AutoResizingTextarea,
  type AutoResizingTextareaProps,
} from "./AutoResizingTextarea";
import type { TierBadge } from "@/lib/members";

// Lounge composer with an @-mention picker. Drop-in wrapper around
// AutoResizingTextarea: same value/onChange contract, plus a Twitter-
// style dropdown that opens when the cursor is sitting inside an
// unfinished `@<query>` token.
//
// Token format: `@<wordchars>` following whitespace or input start —
// matches the server-side MENTION_RE in src/lib/mentions.ts so what
// the picker inserts round-trips back to a member email at submit
// time. The picker inserts `@<mentionToken> ` (trailing space) and
// drops the cursor right after.
//
// Directory is fetched lazily on first focus and cached at module
// scope for the page session — every composer on /lounge shares the
// same list so the second mention you write doesn't re-fetch.

export type MentionDirectoryEntry = {
  displayName: string;
  mentionToken: string;
  isAdmin: boolean;
  isSelf: boolean;
  founderSlot: number | null;
  charterSlot: number | null;
  tierBadge: TierBadge | null;
};

let directoryCache: MentionDirectoryEntry[] | null = null;
let directoryFetch: Promise<MentionDirectoryEntry[]> | null = null;

function loadDirectory(): Promise<MentionDirectoryEntry[]> {
  if (directoryCache) return Promise.resolve(directoryCache);
  if (directoryFetch) return directoryFetch;
  directoryFetch = fetch("/api/lounge/members", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : { members: [] }))
    .then((data) => {
      const members = Array.isArray(data?.members)
        ? (data.members as MentionDirectoryEntry[])
        : [];
      directoryCache = members;
      directoryFetch = null;
      return members;
    })
    .catch(() => {
      directoryFetch = null;
      return [];
    });
  return directoryFetch;
}

const MAX_RESULTS = 6;

type ActiveMention = {
  start: number; // index of the `@` in the value
  query: string; // chars after `@` up to the cursor
};

/**
 * Detect whether the cursor is currently inside an unfinished
 * `@<query>` token. Returns the mention range (start = index of `@`)
 * + the typed query when so, else null. The token has to follow either
 * the very start of input or whitespace — same boundary rule as the
 * server-side parser.
 */
function detectActiveMention(
  value: string,
  cursor: number
): ActiveMention | null {
  if (cursor <= 0) return null;
  // Walk backwards from the cursor looking for the most recent `@`.
  // Stop if we hit whitespace or a non-word char before finding one.
  let i = cursor - 1;
  while (i >= 0) {
    const ch = value[i]!;
    if (ch === "@") {
      // Boundary check: char before `@` must be start-of-input or
      // whitespace. Otherwise it's an email address fragment, not a
      // mention.
      if (i === 0 || /\s/.test(value[i - 1]!)) {
        const query = value.slice(i + 1, cursor);
        // Query has to be word chars only. Anything else (a space,
        // punctuation, etc.) means the user finished the token and
        // moved on — close the picker.
        if (/^\w*$/.test(query)) {
          return { start: i, query };
        }
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

function rankEntries(
  entries: MentionDirectoryEntry[],
  query: string
): MentionDirectoryEntry[] {
  const q = query.toLowerCase();
  const scored = entries
    .filter((e) => !e.isSelf)
    .map((e) => {
      const dn = e.displayName.toLowerCase();
      const tk = e.mentionToken.toLowerCase();
      let score = -1;
      if (q.length === 0) score = 0;
      else if (tk.startsWith(q)) score = 100;
      else if (dn.startsWith(q)) score = 90;
      else if (tk.includes(q)) score = 50;
      else if (dn.includes(q)) score = 40;
      return { entry: e, score };
    })
    .filter((s) => s.score >= 0);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.displayName.localeCompare(b.entry.displayName, undefined, {
      sensitivity: "base",
    });
  });
  return scored.slice(0, MAX_RESULTS).map((s) => s.entry);
}

export type MentionAutoResizingTextareaProps = Omit<
  AutoResizingTextareaProps,
  "onChange" | "value"
> & {
  value: string;
  onValueChange: (next: string) => void;
};

export function MentionAutoResizingTextarea({
  value,
  onValueChange,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  onClick,
  ...rest
}: MentionAutoResizingTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [directory, setDirectory] = useState<MentionDirectoryEntry[]>(
    () => directoryCache ?? []
  );
  const [active, setActive] = useState<ActiveMention | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const results = useMemo(() => {
    if (!active) return [];
    return rankEntries(directory, active.query);
  }, [directory, active]);

  // Lazy-load the directory the first time the textarea gets focus.
  // No-op on subsequent focuses (singleton at module scope).
  const ensureDirectory = useCallback(() => {
    if (directoryCache) return;
    void loadDirectory().then((entries) => {
      setDirectory(entries);
    });
  }, []);

  // Recompute the active mention whenever the value or cursor moves.
  const refreshActive = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? value.length;
    const next = detectActiveMention(value, cursor);
    setActive(next);
    setHighlighted(0);
  }, [value]);

  // After value changes, recompute on the next tick so the textarea's
  // selectionStart reflects the post-change cursor position.
  useEffect(() => {
    refreshActive();
  }, [value, refreshActive]);

  const insertMention = useCallback(
    (entry: MentionDirectoryEntry) => {
      const el = textareaRef.current;
      if (!el) return;
      const cursor = el.selectionStart ?? value.length;
      const range = detectActiveMention(value, cursor);
      if (!range) return;
      // Replace `@<query>` with `@<mentionToken> ` and put the cursor
      // right after the trailing space.
      const before = value.slice(0, range.start);
      const after = value.slice(range.start + 1 + range.query.length);
      const insertion = `@${entry.mentionToken} `;
      const nextValue = `${before}${insertion}${after}`;
      onValueChange(nextValue);
      setActive(null);
      // Restore focus + cursor on the next paint so React's reconcile
      // doesn't fight us. The value prop change triggers a re-render
      // first; queue the selection adjustment after.
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        const pos = before.length + insertion.length;
        node.focus();
        node.setSelectionRange(pos, pos);
      });
    },
    [value, onValueChange]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onValueChange(e.target.value);
    },
    [onValueChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (active && results.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlighted((h) => (h + 1) % results.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlighted((h) => (h - 1 + results.length) % results.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const choice = results[highlighted] ?? results[0];
          if (choice) insertMention(choice);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setActive(null);
          return;
        }
      }
      onKeyDown?.(e);
    },
    [active, results, highlighted, insertMention, onKeyDown]
  );

  const open = active !== null && results.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <AutoResizingTextarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          ensureDirectory();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delay closing so a click on the dropdown lands before the
          // picker disappears. The mousedown handler on each row
          // prevents the textarea from blurring in the first place,
          // but Safari sometimes blurs anyway.
          window.setTimeout(() => setActive(null), 120);
          onBlur?.(e);
        }}
        onKeyUp={(e) => {
          refreshActive();
          onKeyUp?.(e);
        }}
        onClick={(e) => {
          refreshActive();
          onClick?.(e);
        }}
        {...rest}
      />
      {open && (
        <ul
          role="listbox"
          aria-label="Mention a member"
          className="lounge-mention-picker"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 20,
            margin: 0,
            padding: "0.25rem 0",
            listStyle: "none",
            background: "var(--paper)",
            border: "1px solid var(--border)",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
            maxHeight: "16rem",
            overflowY: "auto",
          }}
        >
          {results.map((entry, i) => {
            const isActive = i === highlighted;
            return (
              <li key={entry.mentionToken} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  // Prevent the textarea from blurring before our
                  // onClick handler fires; otherwise the picker closes
                  // and the click lands on nothing.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => insertMention(entry)}
                  className="font-serif"
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: 0,
                    background: isActive ? "var(--paper-deep)" : "transparent",
                    cursor: "pointer",
                    fontSize: "0.92rem",
                    color: "var(--ink)",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.displayName}
                    {entry.isAdmin && (
                      <span
                        className="font-display"
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.62rem",
                          letterSpacing: "0.22em",
                          textTransform: "uppercase",
                          color: "var(--eye-deep)",
                          fontWeight: 600,
                        }}
                      >
                        author
                      </span>
                    )}
                    {!entry.isAdmin && entry.founderSlot !== null && (
                      <span
                        className="font-display"
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.62rem",
                          letterSpacing: "0.22em",
                          textTransform: "uppercase",
                          color: "var(--ink-faint)",
                          fontWeight: 600,
                        }}
                      >
                        founder
                      </span>
                    )}
                    {!entry.isAdmin && entry.charterSlot !== null && (
                      <span
                        className="font-display"
                        style={{
                          marginLeft: "0.5rem",
                          fontSize: "0.62rem",
                          letterSpacing: "0.22em",
                          textTransform: "uppercase",
                          color: "var(--ink-faint)",
                          fontWeight: 600,
                        }}
                      >
                        charter
                      </span>
                    )}
                  </span>
                  <span
                    className="font-display"
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--ink-faint)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    @{entry.mentionToken}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
