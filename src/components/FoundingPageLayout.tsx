import Link from "next/link";
import { EyeDivider } from "@/components/Eyes";
import { DualSubscribeBlock } from "@/components/DualSubscribeBlock";

// Shared layout for the two founding-text pieces under /founding/*.
// Mirrors the essay-page vocabulary (centered masthead, eyebrow +
// large serif title, deck line below, EyeDivider, body, EyeDivider,
// footer) but adds the distinguishing "FOUNDING TEXT" eyebrow at the
// top and the cross-link + membership CTA footer the regular essay
// template doesn't carry.
//
// Body content is rendered as `children` so each page can paste in
// its own markdown-rendered HTML or React tree without forcing the
// layout to know about the storage format.

export type FoundingPageLayoutProps = {
  title: string;
  /** Short context line below the title — e.g. "September 2025" or
      "the founding piece". Optional. */
  dateLine?: string;
  /** The other founding piece, for the footer cross-link. */
  companion: {
    title: string;
    href: string;
  };
  children: React.ReactNode;
};

export function FoundingPageLayout({
  title,
  dateLine,
  companion,
  children,
}: FoundingPageLayoutProps) {
  return (
    <article className="relative">
      {/* === Masthead ============================================= */}
      <header className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">
            Founding Text
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
          {dateLine && (
            <p
              className="font-serif italic text-ink-muted fade-up stagger-3"
              style={{ fontSize: "1rem" }}
            >
              {dateLine}
            </p>
          )}
        </div>
      </header>

      {/* === Body ================================================
           Caller renders the essay content here. Wrap in
           `prose-article` if injecting HTML; pass plain React
           children if composing the piece in JSX. The masthead's
           border-b carries the only separator between subtitle and
           body — no decorative ornament, just the hairline. */}
      <div className="max-w-4xl mx-auto px-6 pt-12 md:pt-16">
        {children}
      </div>

      <EyeDivider />

      {/* === Footer ============================================
           Two beats in order:
             1. Dual-tier CTAs (free email + paid membership) via
                the shared DualSubscribeBlock — same conversion
                surface that lives on every other page of the site,
                so the founding pages don't drift from the rest.
             2. Companion cross-link at the very bottom (quieter,
                centered) — sits below the CTAs so the call to act
                lands first. */}
      <section className="max-w-3xl mx-auto px-6 pb-12 md:pb-16 pt-12">
        <DualSubscribeBlock />
      </section>

      {/* === Companion cross-link (very bottom) =================
           Quiet read-next pointer to the other founding piece.
           Sits below the CTAs so the call to act lands first. */}
      <section className="max-w-3xl mx-auto px-6 pb-20 md:pb-28">
        <p
          className="font-serif italic text-ink-muted text-center"
          style={{ fontSize: "0.95rem" }}
        >
          Read the companion piece:{" "}
          <Link
            href={companion.href}
            className="text-eye-deep hover:text-ink no-underline transition-colors not-italic"
            style={{ fontWeight: 600 }}
          >
            {companion.title} &rarr;
          </Link>
        </p>
      </section>
    </article>
  );
}
