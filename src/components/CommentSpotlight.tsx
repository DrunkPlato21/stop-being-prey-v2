"use client";

import { useEffect, useState } from "react";
import {
  COMMENT_POSTED_EVENT,
  revealComment,
} from "@/lib/comment-spotlight";

// Confirmation that a comment posted, and a way back to it.
//
// Lives outside CommentForm on purpose: posting your last allowed comment
// REPLACES the form with the "you've used your comments" block, so a
// confirmation rendered inside the form would unmount at the exact moment
// it's needed. That's the case readers actually hit. This sits in the
// comments section instead and listens for the event.
//
// Two layers, because the scroll can lose a race with a slow refresh:
// the highlight on the comment itself, and this panel, which stays put
// with a button that scrolls again on demand.

export function CommentSpotlight() {
  const [id, setId] = useState<string | null>(null);
  const [found, setFound] = useState(false);

  useEffect(() => {
    function onPosted(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const posted = detail?.id;
      if (!posted) return;
      setId(posted);
      setFound(false);
      void revealComment(posted).then((ok) => setFound(ok));
    }
    window.addEventListener(COMMENT_POSTED_EVENT, onPosted);
    return () => window.removeEventListener(COMMENT_POSTED_EVENT, onPosted);
  }, []);

  // Long enough to read and act on without becoming furniture.
  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(() => setId(null), 45_000);
    return () => window.clearTimeout(timer);
  }, [id]);

  if (!id) return null;

  return (
    <div className="comment-posted-toast" role="status" aria-live="polite">
      <p className="comment-posted-toast-title">Your comment is posted.</p>
      <p className="comment-posted-toast-body">
        {found
          ? "It is highlighted on the page above."
          : "It is on the page above, with the other comments."}
      </p>
      <div className="comment-posted-toast-actions">
        <button
          type="button"
          className="comment-posted-toast-cta"
          onClick={() => {
            void revealComment(id).then((ok) => setFound(ok));
          }}
        >
          Show me my comment
        </button>
        <button
          type="button"
          className="comment-posted-toast-close"
          onClick={() => setId(null)}
        >
          Close
        </button>
      </div>
    </div>
  );
}
