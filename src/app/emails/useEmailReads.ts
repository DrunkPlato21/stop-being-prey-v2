"use client";

import { useCallback, useEffect, useState } from "react";

// The patron's read marks, shared by the index and the reading page.
// Starts from what the server rendered, re-checks on arrival and when the
// tab comes back (the back button and a phone that read three emails
// since can both leave the rendered list stale), and updates optimistically
// on a toggle, rolling back if the write fails.

function apiUrl(): string {
  const dev = new URLSearchParams(window.location.search).get("dev_preview");
  return `/api/emails/read${dev ? `?dev_preview=${dev}` : ""}`;
}

export function useEmailReads(initial: number[]) {
  const [read, setReadIds] = useState<Set<number>>(() => new Set(initial));

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetch(apiUrl(), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { read: number[] } | null) => {
          if (alive && body) setReadIds(new Set(body.read));
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
  }, []);

  const setRead = useCallback((kitId: number, isRead: boolean) => {
    const apply = (to: boolean) =>
      setReadIds((prev) => {
        if (prev.has(kitId) === to) return prev;
        const next = new Set(prev);
        if (to) next.add(kitId);
        else next.delete(kitId);
        return next;
      });
    apply(isRead);
    fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kitId, read: isRead }),
    })
      .then((r) => {
        if (!r.ok) apply(!isRead);
      })
      .catch(() => apply(!isRead));
  }, []);

  return { read, setRead };
}
