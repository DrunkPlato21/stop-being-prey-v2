import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getBook, statusLabel } from "@/lib/book";
import { BookCover } from "@/components/BookCover";
import { BookNotifyForm } from "@/components/BookNotifyForm";

export const metadata: Metadata = {
  title: "The Book",
};

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/book");
  }

  const book = await getBook();
  const subtitle =
    book.subtitle ||
    "The argument that became the site, gathered into a single book.";
  const description = book.description.trim();
  const paragraphs = description ? description.split(/\n\n+/) : [];

  return (
    <div className="rules-paper">
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Members area</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-5 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {book.title}.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            {subtitle}
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        {/* Hero: cover + description side-by-side on desktop,
            stacked on mobile. */}
        <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-12 mb-12">
          <div className="flex-shrink-0 self-center md:self-start">
            <BookCover
              coverUrl={book.coverUrl}
              title={book.title}
              size="hero"
            />
          </div>
          <div className="flex-1 min-w-0">
            {paragraphs.length === 0 ? (
              /* Placeholder body for the launch window. Renders only
                 when the book record has no description saved. Clay
                 replaces this via /admin/book; once a description is
                 saved, this whole branch goes away. */
              <div className="flex flex-col gap-5">
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
                >
                  This book is the doctrine the site exists to spread,
                  written down once and properly. The predator-prey
                  frame that runs through every essay, every Field
                  Note, every Case File. The eight Rules of Engagement
                  and the moves they unlock, set against real
                  arguments, real failures, and the muscle memory it
                  takes to win the ones that matter.
                </p>
                <p
                  className="font-serif text-ink leading-relaxed"
                  style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
                >
                  It&apos;s written for the operator class. People
                  who are tired of losing public arguments they&apos;re
                  right about. People who&apos;ve watched bad-faith
                  opponents walk away untouched. People who want to
                  convert hostility into leverage instead of damage.
                  If the site has been useful to you, the book is what
                  made the site possible.
                </p>
                <p
                  className="font-serif italic text-ink-muted leading-relaxed"
                  style={{ fontSize: "1rem", lineHeight: 1.65 }}
                >
                  The manuscript is in active development. I&apos;m
                  writing it the same way I write the essays: slow,
                  sharp, no filler. When it ships you&apos;ll get one
                  email. Sign up below if you want to know.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                    style={{ fontSize: "1.05rem", lineHeight: 1.65 }}
                  >
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status panel */}
        <div
          className="px-7 py-6 md:px-9 md:py-7 mb-12"
          style={{
            background: "var(--paper-deep)",
            border: "1px solid var(--rule)",
          }}
        >
          <p
            className="eyebrow mb-1.5"
            style={{ fontSize: "0.62rem", letterSpacing: "0.32em" }}
          >
            Status
          </p>
          <p
            className="font-display text-ink"
            style={{
              fontSize: "1.2rem",
              fontWeight: 700,
              letterSpacing: "-0.005em",
            }}
          >
            {statusLabel(book.status)}
          </p>
        </div>

        {/* Optional: excerpt / sample chapter */}
        {book.excerpt && (
          <div className="mb-12">
            <p
              className="eyebrow mb-4"
              style={{ fontSize: "0.68rem", letterSpacing: "0.32em" }}
            >
              From the manuscript
            </p>
            <div
              className="px-7 py-7 md:px-9 md:py-9"
              style={{
                background: "var(--paper)",
                border: "1px solid var(--rule)",
              }}
            >
              <div className="flex flex-col gap-4">
                {book.excerpt.split(/\n\n+/).map((p, i) => (
                  <p
                    key={i}
                    className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                    style={{ fontSize: "1.02rem", lineHeight: 1.65 }}
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Optional: chapter list */}
        {book.chapters && book.chapters.length > 0 && (
          <div className="mb-12">
            <p
              className="eyebrow mb-4"
              style={{ fontSize: "0.68rem", letterSpacing: "0.32em" }}
            >
              Chapters
            </p>
            <ul className="flex flex-col">
              {book.chapters.map((c, i) => (
                <li
                  key={i}
                  className={
                    "flex items-baseline justify-between gap-4 py-3 " +
                    (i === 0 ? "" : "border-t border-rule")
                  }
                >
                  <span
                    className="font-serif text-ink"
                    style={{ fontSize: "1rem" }}
                  >
                    {c.title}
                  </span>
                  <span
                    className="font-display uppercase text-ink-faint"
                    style={{
                      fontSize: "0.62rem",
                      letterSpacing: "0.22em",
                      fontWeight: 600,
                    }}
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Optional: preorder CTA */}
        {book.preorderUrl && (
          <div className="mb-12 text-center">
            <a
              href={book.preorderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <span>Pre-order the book &rarr;</span>
            </a>
          </div>
        )}

        {/* Signup */}
        <div
          className="px-7 py-7 md:px-9 md:py-8"
          style={{
            background: "var(--paper)",
            border: "1px solid var(--eye-deep)",
          }}
        >
          <h2
            className="font-display text-ink leading-snug tracking-tight mb-3"
            style={{
              fontSize: "clamp(1.35rem, 2.4vw, 1.6rem)",
              fontWeight: 700,
              letterSpacing: "-0.015em",
            }}
          >
            Get notified when the book is ready.
          </h2>
          <p
            className="font-serif italic text-ink-muted mb-5"
            style={{ fontSize: "0.98rem", lineHeight: 1.6 }}
          >
            I&apos;ll send one email when it ships. No spam, no
            chasing.
          </p>
          <BookNotifyForm defaultEmail={session.email} />
        </div>

        <p
          className="font-serif italic text-ink-faint text-center mt-10"
          style={{ fontSize: "0.85rem" }}
        >
          stay close,
          <br />~ Clay
        </p>
      </section>
    </div>
  );
}
