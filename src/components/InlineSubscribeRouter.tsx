"use client";

import { useEffect, useState, type ReactNode } from "react";
import { isKnownSubscriber } from "@/lib/subscribed";

// Client half of the inline mid-article capture. It only decides WHICH ask
// to show; the asks themselves are server-rendered and handed in as props
// (`cold` / `member`), so the async <SubscriberCount> inside the cold form
// stays a server component instead of being illegally nested in a client
// component (that was the "async Client Component" crash).
//
// Resolves the cold-vs-subscriber split from the cookieless per-browser
// localStorage flag (lib/subscribed), and renders nothing until it knows,
// which avoids a wrong-ask flash and any hydration mismatch. New device =
// the cold form again; Kit dedupes.

export function InlineSubscribeRouter({
  cold,
  member,
  className = "",
}: {
  cold: ReactNode;
  member: ReactNode;
  className?: string;
}) {
  const [subscriber, setSubscriber] = useState<boolean | null>(null);

  useEffect(() => {
    setSubscriber(isKnownSubscriber());
  }, []);

  // Until we know which ask to show, render nothing (see note above).
  if (subscriber === null) return null;

  return (
    <aside
      className={`border-y border-rule py-10 md:py-12 my-10 md:my-14 ${className}`}
    >
      {subscriber ? member : cold}
    </aside>
  );
}
