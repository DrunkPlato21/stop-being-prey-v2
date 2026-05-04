import type { Metadata } from "next";
import { getAllArticles } from "@/lib/articles";
import { SubmitLetterForm } from "./SubmitLetterForm";

export const metadata: Metadata = {
  title: "Submit a Letter",
  description:
    "Letters to the Preditor — the reader column of Stop Being Prey. Submit a letter for the next monthly edition.",
};

export default function SubmitLetterPage() {
  const articles = getAllArticles().map((a) => ({
    slug: a.slug,
    title: a.title,
  }));

  return (
    <div>
      {/* Masthead */}
      <section className="border-b border-rule">
        <div className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Editorial</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.75rem, 6vw, 5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Submit a Letter
          </h1>
          <p className="deck max-w-2xl mx-auto fade-up stagger-3">
            Letters to the Preditor runs once a month. Reader letters that
            landed hardest, edited for length and clarity, attributed however
            you choose.
          </p>
        </div>
      </section>

      {/* Editorial framing */}
      <div className="max-w-2xl mx-auto px-6 pt-12">
        <div className="font-serif text-ink leading-relaxed space-y-5" style={{ fontSize: "1.13rem" }}>
          <p>
            Letters to the Preditor is the reader column of Stop Being Prey.
            It runs monthly. Letters that wrestle with the doctrine, push back
            on it, extend it, or share a story it triggered, those are the
            ones that make it in.
          </p>
          <p>
            I read every letter that comes in. If yours runs in the next
            edition, I&apos;ll send the proof to you first.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-6 py-12">
        <SubmitLetterForm articles={articles} />
      </div>
    </div>
  );
}
