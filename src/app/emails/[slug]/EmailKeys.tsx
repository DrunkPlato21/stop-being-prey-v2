"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Arrow keys page through the archive on a keyboard: left is the older
// email, right is the newer one. Ignored while typing anywhere.

export function EmailKeys({
  olderHref,
  newerHref,
}: {
  olderHref: string | null;
  newerHref: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const href =
        e.key === "ArrowLeft" ? olderHref : e.key === "ArrowRight" ? newerHref : null;
      if (href) router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [olderHref, newerHref, router]);
  return null;
}
