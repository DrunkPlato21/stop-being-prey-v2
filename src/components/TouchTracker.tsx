"use client";

import { useEffect } from "react";
import { recordTouch } from "@/lib/touches";
import { track } from "@/lib/track";
import type { TrackEvent } from "@/lib/analytics";

// Marks one step on a visitor's path to patronage (see lib/touches): adds
// the touch to the sbp_path cookie and counts the matching archive event,
// once per mount. Renders nothing. Server pages drop it in wherever a
// surface matters: the archive index, a locked email, a free sample.

export function TouchTracker({
  touch,
  event,
}: {
  touch: string;
  event?: TrackEvent;
}) {
  useEffect(() => {
    // After the layout's FirstTouchTracker has run (child effects run
    // first), so a tagged email link lands on the path before the page
    // it opened.
    const id = setTimeout(() => {
      recordTouch(touch);
      if (event) track(event, { source: "archive" });
    }, 0);
    return () => clearTimeout(id);
  }, [touch, event]);
  return null;
}
