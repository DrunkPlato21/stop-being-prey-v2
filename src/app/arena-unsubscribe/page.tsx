import type { Metadata } from "next";
import { verifyArenaToken } from "@/lib/auth";
import { unsubscribeFromArena } from "./actions";

// Public, no-login unsubscribe for Arena email. Both Arena emails (the
// live-fight alert and the followed-bout verdict) link here with a
// signed long-lived token. One deliberate click stops both; the seat,
// the sign-in, the Sunday digest and every other email are untouched,
// and the page says so, because "unsubscribe" next to a paid membership
// reads as scarier than it is.
//
// The mutation lives behind the button (server action), never the GET:
// link scanners prefetch footer URLs, and a prefetch must not silently
// unsubscribe anyone.
//
// Top-level rather than /arena/unsubscribe, because /arena/<slug> is
// the bout route and a static child segment would shadow any bout whose
// title slugified to the same word.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arena email",
  description: "Stop Arena email.",
  robots: { index: false, follow: false },
};

export default async function ArenaUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
  const { token, done, error } = await searchParams;
  const email = done || error ? null : await verifyArenaToken(token);

  let headline: string;
  let deck: React.ReactNode;
  let body: React.ReactNode = null;

  if (done) {
    headline = "Done. The Arena goes quiet.";
    deck =
      "No more fight alerts and no more verdicts. Your seat, your sign-in and the Sunday digest stay exactly as they were, and the room is still there whenever you want to walk in.";
  } else if (error || !email) {
    headline = "This link has expired.";
    deck = (
      <>
        No harm done, nothing was changed. Email{" "}
        <a
          href="mailto:clay@stopbeingprey.com"
          className="text-eye-deep hover:text-ink"
          style={{
            textDecoration: "underline",
            textDecorationColor: "var(--eye)",
            textDecorationThickness: "1px",
            textUnderlineOffset: "3px",
          }}
        >
          clay@stopbeingprey.com
        </a>{" "}
        and I&apos;ll stop it for you personally.
      </>
    );
  } else {
    headline = "Stop Arena email?";
    deck =
      "One click and it stops. That covers the alert when a fight starts and the verdict on any fight you followed. Your seat, your sign-in and the Sunday digest stay exactly as they are.";
    body = (
      <form action={unsubscribeFromArena}>
        <input type="hidden" name="token" value={token ?? ""} />
        <button
          type="submit"
          className="inline-block font-display uppercase tracking-[0.22em] cursor-pointer"
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            background: "var(--ink, #1a1714)",
            color: "#f5efe1",
            padding: "14px 30px",
            border: "1px solid var(--ink, #1a1714)",
          }}
        >
          Stop Arena email
        </button>
      </form>
    );
  }

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">The Arena</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          {headline}
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">{deck}</p>
        {body}
      </section>
    </div>
  );
}
