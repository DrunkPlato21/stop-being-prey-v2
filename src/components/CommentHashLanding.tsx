"use client";

import { useEffect } from "react";

// Landing on a comment link (#c-<id> / #r-<id>) from a notification email,
// a coin receipt, or a copied permalink.
//
// The anchors are in the server HTML, so the browser does scroll to them,
// but it aims once, early, and smoothly (globals.css sets scroll-behavior:
// smooth). The essay above the comments has lazy images and embeds that
// grow after that aim, so the reader ended up ~1600px short of the comment
// on a 390px viewport (measured on production before this existed). Same
// fix as revealComment in lib/comment-spotlight.ts: instant scroll, then
// re-aim while the page settles. Stops the moment the reader scrolls or
// touches, so it never fights them. Renders nothing.

const SETTLE_MS = 250;
const SETTLE_TRIES = 12; // ~3s

function isLanded(el: HTMLElement): boolean {
  const top = el.getBoundingClientRect().top;
  return top >= -8 && top <= window.innerHeight * 0.5;
}

export function CommentHashLanding() {
  useEffect(() => {
    let timer = 0;
    const stop = () => {
      window.clearInterval(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };

    const land = () => {
      stop();
      const hash = window.location.hash;
      if (!/^#[cr]-[\w-]+$/.test(hash)) return;
      const id = decodeURIComponent(hash.slice(1));

      let tries = 0;
      const aim = () => {
        const el = document.getElementById(id);
        if (el && !isLanded(el)) {
          el.scrollIntoView({ block: "start", behavior: "instant" });
        }
        tries += 1;
        if (tries >= SETTLE_TRIES) stop();
      };

      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchstart", stop, { passive: true });
      window.addEventListener("keydown", stop);
      aim();
      timer = window.setInterval(aim, SETTLE_MS);
    };

    land();
    // A link to another comment on the same page is a hash change, not a
    // load.
    window.addEventListener("hashchange", land);
    return () => {
      stop();
      window.removeEventListener("hashchange", land);
    };
  }, []);

  return null;
}
