"use client";

import { useEffect, useState } from "react";

// Comment timestamps must read in the VIEWER's local timezone. The
// comment list is server-rendered, and on Vercel the server runs in UTC,
// so a plain server-side toLocaleString() printed every comment time in
// UTC (a reader in Eastern saw "12:40 AM" for a comment posted at 8:40 PM
// their time). The server can't know the viewer's timezone, so the local
// time can only be computed in the browser.
//
// First render (SSR + initial hydration) is deterministic UTC so the
// server and client markup match — no hydration mismatch. On mount we
// swap to the viewer's local timezone.

const FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function CommentTime({ ms }: { ms: number }) {
  const [text, setText] = useState(() =>
    new Date(ms).toLocaleString("en-US", { ...FORMAT, timeZone: "UTC" })
  );

  useEffect(() => {
    // Local timezone (no explicit timeZone => the browser's).
    setText(new Date(ms).toLocaleString("en-US", FORMAT));
  }, [ms]);

  return (
    <time dateTime={new Date(ms).toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
