import type { Metadata } from "next";
import { verifyDigestToken } from "@/lib/auth";
import { unsubscribeFromDigest } from "./actions";

// Public, no-login digest unsubscribe. The weekly digest footer links
// here with a signed long-lived token. One deliberate click stops the
// digest; membership, sign-in and every other email are untouched, and
// the page says so, because "unsubscribe" next to a paid membership
// reads as scarier than it is.
//
// The mutation lives behind the button (server action), never the GET:
// link scanners prefetch footer URLs, and a prefetch must not silently
// unsubscribe anyone.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekly digest",
  description: "Stop the weekly digest email.",
  robots: { index: false, follow: false },
};

export default async function DigestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string; error?: string }>;
}) {
  const { token, done, error } = await searchParams;
  const email = done || error ? null : await verifyDigestToken(token);

  let headline: string;
  let deck: React.ReactNode;
  let body: React.ReactNode = null;

  if (done) {
    headline = "Done. The digest stops here.";
    deck =
      "Your seat, your sign-in and everything else stay exactly as they were. If you change your mind someday, write me and I’ll turn it back on.";
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
        and I&apos;ll stop the digest for you personally.
      </>
    );
  } else {
    headline = "Stop the weekly digest?";
    deck =
      "One click and it stops. Your seat, your sign-in and every other email stay exactly as they are. This only quiets the Sunday report.";
    body = (
      <form action={unsubscribeFromDigest}>
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
          Stop the digest
        </button>
      </form>
    );
  }

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">Weekly digest</p>
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
