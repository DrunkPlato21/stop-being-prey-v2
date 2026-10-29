"use client";

import { useCallback, useEffect, useState } from "react";

// A patron's marks (read, or starred), shared by the index and the
// reading page. Starts from what the server rendered, re-checks on
// arrival and when the tab comes back (the back button and a phone that
// read three emails since can both leave the rendered list stale), and
// updates optimistically on a toggle, rolling back if the write fails.

type Endpoint = "read" | "favorite";

function apiUrl(endpoint: Endpoint): string {
  const dev = new URLSearchParams(window.location.search).get("dev_preview");
  return `/api/emails/${endpoint}${dev ? `?dev_preview=${dev}` : ""}`;
}

export function useEmailMarks(endpoint: Endpoint, initial: number[]) {
  const [marked, setMarked] = useState<Set<number>>(() => new Set(initial));

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetch(apiUrl(endpoint), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { ids: number[] } | null) => {
          if (alive && body) setMarked(new Set(body.ids));
        })
        .catch(() => {});
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endpoint]);

  const setMark = useCallback(
    (kitId: number, on: boolean) => {
      const apply = (to: boolean) =>
        setMarked((prev) => {
          if (prev.has(kitId) === to) return prev;
          const next = new Set(prev);
          if (to) next.add(kitId);
          else next.delete(kitId);
          return next;
        });
      apply(on);
      fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId, on }),
      })
        .then((r) => {
          if (!r.ok) apply(!on);
        })
        .catch(() => apply(!on));
    },
    [endpoint]
  );

  return { marked, setMark };
}

export function useEmailReads(initial: number[]) {
  const { marked, setMark } = useEmailMarks("read", initial);
  return { read: marked, setRead: setMark };
}

export function useEmailFavorites(initial: number[]) {
  const { marked, setMark } = useEmailMarks("favorite", initial);
  return { favs: marked, setFav: setMark };
}
