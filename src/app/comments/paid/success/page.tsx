import Link from "next/link";
import type { Metadata } from "next";
import { getPaidCommentByCheckoutSession } from "@/lib/paid-comments";
import { getAllArticles } from "@/lib/articles";
import { getAllFieldNotes } from "@/lib/field-notes";
import { getAllCaseFiles } from "@/lib/case-files";
import type { CommentRecord } from "@/lib/comments";

// Landing page after Stripe redirects from a paid-comment Checkout.
// We poll briefly for the webhook to flip the record from
// awaiting_payment → paid; in dev the webhook is async and in prod
// it's usually <200ms, but the budget here is conservative.

export const metadata: Metadata = {
  title: "Comment received",
  description: "Your comment is in review.",
};

export const dynamic = "force-dynamic";

async function pollForPaid(
  sessionId: string,
  attempts = 6,
  delayMs = 250
): Promise<CommentRecord | null> {
  for (let i = 0; i < attempts; i++) {
    const record = await getPaidCommentByCheckoutSession(sessionId);
    if (record && record.paymentStatus === "paid") return record;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Final fetch — return whatever's there even if still awaiting,
  // so the UI can degrade gracefully.
  return getPaidCommentByCheckoutSession(sessionId);
}

function pieceLink(record: CommentRecord): { title: string; href: string } {
  if (record.kind === "article") {
    const a = getAllArticles().find((x) => x.slug === record.slug);
    return { title: a?.title ?? record.slug, href: `/${record.slug}` };
  }
  if (record.kind === "case-file") {
    const c = getAllCaseFiles().find((x) => x.slug === record.slug);
    return {
      title: c?.title ?? record.slug,
      href: `/case-files/${record.slug}`,
    };
  }
  const n = getAllFieldNotes().find((x) => x.slug === record.slug);
  return {
    title: n?.title ?? record.slug,
    href: `/notes/field-notes/${record.slug}`,
  };
}

export default async function PaidCommentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  const record = session_id ? await pollForPaid(session_id) : null;
  const piece = record ? pieceLink(record) : null;
  const stillPending = record?.paymentStatus === "awaiting_payment";

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
        <p className="eyebrow mb-6 fade-up stagger-1">Received</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          {record ? "Your comment is in." : "Payment received."}
        </h1>

        <div
          className="font-display italic text-ink leading-[1.3] mx-auto fade-up stagger-3"
          style={{
            fontSize: "clamp(1.1rem, 2.3vw, 1.4rem)",
            fontWeight: 400,
          }}
        >
          {record && !stillPending && (
            <p className="mb-5">
              Clay reviews comments before they go live. Yours is in the queue —
              usually approved the same day.
            </p>
          )}
          {record && stillPending && (
            <p className="mb-5">
              Stripe confirmed the payment. The moderation queue hasn&apos;t
              picked it up yet. Refresh in a moment.
            </p>
          )}
          {!record && (
            <p className="mb-5">
              We couldn&apos;t match this session to a comment. If you were
              charged, email{" "}
              <a
                href="mailto:clay@stopbeingprey.com"
                className="not-italic text-eye-deep"
              >
                clay@stopbeingprey.com
              </a>{" "}
              and we&apos;ll sort it.
            </p>
          )}
        </div>

        {record && (
          <div className="mt-10 mb-12 mx-auto" style={{ maxWidth: "32rem" }}>
            <div
              className="text-left"
              style={{
                background: "var(--paper-deep)",
                border: "1px solid var(--rule)",
                padding: "1.25rem 1.5rem",
              }}
            >
              <p className="eyebrow mb-3" style={{ fontSize: "0.6rem" }}>
                Comment received
              </p>
              <p
                className="font-display text-ink mb-2"
                style={{ fontSize: "1rem", fontWeight: 600 }}
              >
                {record.displayName}
              </p>
              <p
                className="font-serif text-ink leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: "1rem" }}
              >
                {record.body}
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-4">
          {piece && (
            <Link href={piece.href} className="btn-primary">
              <span>Back to &ldquo;{piece.title}&rdquo;</span>
            </Link>
          )}
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← back home
          </Link>
        </div>
      </section>
    </div>
  );
}
