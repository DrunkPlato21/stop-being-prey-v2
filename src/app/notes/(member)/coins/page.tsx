import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { listReceivedCoins, type CoinReceipt } from "@/lib/coins";
import { markNavViewed } from "@/lib/nav-dots";

export const metadata: Metadata = {
  title: "Your Coins",
  description: "Coins other members have given your comments.",
};

export const dynamic = "force-dynamic";

function permalink(receipt: CoinReceipt): string {
  if (receipt.kind === "article") {
    return `/${receipt.slug}#c-${receipt.commentId}`;
  }
  if (receipt.kind === "case-file") {
    return `/case-files/${receipt.slug}#c-${receipt.commentId}`;
  }
  return `/notes/field-notes/${receipt.slug}#c-${receipt.commentId}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function YourCoinsPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session?.email) {
    redirect("/notes/sign-in?next=/notes/coins");
  }

  const received = await listReceivedCoins(session.email).catch(() => []);

  // Stamp this visit so the "Your Coins" nav dot clears. Best-effort;
  // a failed write just leaves the dot for next render.
  await markNavViewed("coins", session.email).catch(() => {});

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-20 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Your Coins.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Coins other members gave your comments. Each one is a member
            choosing to spend their single coin on something you wrote.
            This is your permanent collection. It stays here for good.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <div className="mb-8">
          <Link
            href="/desk"
            className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.62rem", fontWeight: 600 }}
          >
            &larr; Back to the desk
          </Link>
        </div>

        {received.length === 0 ? (
          <p
            className="font-serif italic text-ink-muted text-center leading-relaxed"
            style={{ fontSize: "1.05rem" }}
          >
            No coins yet. When another member gives a coin to one of your
            comments, it shows up here.
          </p>
        ) : (
          <ul className="flex flex-col">
            {received.map((r, idx) => (
              <li
                key={r.id}
                className={idx === 0 ? "py-5" : "py-5 border-t border-rule"}
              >
                <Link
                  href={permalink(r)}
                  className="block no-underline group"
                >
                  <p
                    className="eyebrow mb-1.5"
                    style={{ letterSpacing: "0.2em", fontSize: "0.62rem" }}
                  >
                    {r.giverDisplayName} gave you a coin
                    <span className="text-ink-faint">
                      {" · "}
                      {formatDate(r.givenAt)}
                    </span>
                  </p>
                  <p
                    className="font-serif text-ink leading-relaxed group-hover:text-eye-deep transition-colors"
                    style={{ fontSize: "1.05rem" }}
                  >
                    &ldquo;{r.commentExcerpt}&rdquo;
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
