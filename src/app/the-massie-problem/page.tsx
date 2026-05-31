import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { EyeDivider } from "@/components/Eyes";
import { Comments } from "@/components/Comments";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { loadEssay } from "@/lib/early-access";

// Member-only EARLY ACCESS drop for "The Thomas Massie Problem".
// Prologue through Act 5 only; Act 6 is still being written and lives
// outside content/articles so nothing auto-publishes it (no public
// [slug] URL, no social cards, no sitemap/essays listing).
//
// Gating: this route is NOT in proxy.ts's matcher, so the page owns its
// own gate. We read the sbp_session cookie and render the essay only for
// signed-in members; everyone else gets the paywall prompt INSTEAD of
// the content (the body is never sent to non-members — server-side
// branch, not a CSS hide). Same JWT session mechanism the rest of the
// member surfaces use (see src/lib/auth.ts).

// Route + content-file slug. This is the live URL (/the-massie-problem)
// and the markdown filename under content/early-access.
const SLUG = "the-massie-problem";
// Comments key. Deliberately pinned to the ORIGINAL slug so the rename
// from /the-massie-eulogy doesn't orphan member comments already stored
// in Redis under comments:article:the-massie-eulogy. Do not "fix" this to
// match SLUG without migrating the existing comment data first.
const COMMENT_SLUG = "the-massie-eulogy";

// Reads cookies → opt into dynamic rendering explicitly.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Thomas Massie Problem",
  description:
    "An early-access essay for members. Read it before anyone else.",
  // Member-only window: keep it out of search indexes entirely.
  robots: { index: false, follow: false },
};

// Essay loading + the {{PULL}}/{{FIGURE}}/{{IMAGE}} + blockquote token
// rendering now live in @/lib/early-access so the localhost authoring
// editor (/admin/early-access) previews with the exact same pipeline.

export default async function MassieProblemPage() {
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );

  // Non-members never receive the essay body.
  if (!session?.email) {
    return <Paywall />;
  }

  const { title, dateStr, bodyHtml } = await loadEssay(SLUG);

  return (
    <article className="relative">
      {/* === Masthead === */}
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Members &middot; Early access
          </p>
          <h1
            className="font-display text-ink leading-[0.98] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            {title}
          </h1>
          <p className="deck max-w-2xl mx-auto mb-10 fade-up stagger-3">
            Why Massie Lost, Why Libertarians Always Lose, and Why They
            Turned on the Alliance That Just Freed Ross Ulbricht.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-ink-faint fade-up stagger-4 uppercase tracking-[0.15em]">
            <span>By Clay</span>
            {dateStr && (
              <>
                <span className="text-rule">&middot;</span>
                <time>{dateStr}</time>
              </>
            )}
          </div>
        </div>
      </header>

      {/* === Body === */}
      <div className="max-w-4xl mx-auto px-6 pt-12 md:pt-16">
        {/* Author's draft note. Same paper-deep + olive register as the
            "To be continued" card at the foot, so they bookend the piece. */}
        <aside
          className="max-w-[42rem] mx-auto mb-14 md:mb-16 px-6 py-7 md:px-9 md:py-8"
          style={{
            background: "var(--paper-deep)",
            borderLeft: "2px solid var(--eye-deep)",
          }}
        >
          <p
            className="eyebrow mb-5"
            style={{
              fontSize: "0.86rem",
              letterSpacing: "0.28em",
              fontWeight: 600,
              color: "var(--eye-deep)",
            }}
          >
            Quick note before you start
          </p>
          <div
            className="font-serif text-ink"
            style={{ fontSize: "1.05rem", lineHeight: 1.7 }}
          >
            <p className="mb-4">
              This is still a rough draft, but it&apos;s all here now,
              Prologue through Act 6.
            </p>
            <p className="mb-4">
              I&apos;ll keep updating and polishing it. If you spot
              errors, anything that reads off, anything you&apos;d push
              back on... send it. All feedback welcome.
            </p>
            <p className="mb-4">
              And if you just want to tell me it landed... I&apos;ll take
              that too. Honestly, I need it. Been through hell writing this
              one.
            </p>
            <p className="mb-6">
              I hope you find something worth your time in here.
            </p>
            <p
              className="font-display text-ink"
              style={{ fontSize: "1rem", fontWeight: 500 }}
            >
              ~ Clay
            </p>
          </div>
        </aside>

        <div
          className="prose-article ea-essay"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>

      <EyeDivider />

      {/* Members-only early access, so every viewer here is signed in;
          the Comments component renders the member form directly. */}
      <Comments kind="article" slug={COMMENT_SLUG} />

      <div className="text-center pb-16">
        <Link
          href="/desk"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to the desk
        </Link>
      </div>
    </article>
  );
}

// Shown to anyone without a valid member session. Same visual register
// as /notes/sign-in — a quiet prompt in place of the essay, with a path
// to join and a path to sign in. No essay text reaches this branch.
function Paywall() {
  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">Members &middot; Early access</p>
        <h1
          className="font-display text-ink leading-[1.02] tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          The Thomas Massie Problem
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">
          This essay is early access for members. The full piece,
          Prologue through Act 6, is behind the membership.
        </p>

        <Link href="/membership" className="btn-primary">
          <span>See what&apos;s inside</span>
        </Link>

        <p className="mt-12 text-sm italic text-ink-muted leading-relaxed max-w-md mx-auto">
          Already a member?{" "}
          <Link
            href={`/notes/sign-in?next=/${SLUG}`}
            className="text-eye-deep hover:text-ink"
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--eye)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
            }}
          >
            Sign in.
          </Link>
        </p>
      </section>
    </div>
  );
}
