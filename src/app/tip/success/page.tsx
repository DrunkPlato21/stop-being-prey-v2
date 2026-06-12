import Link from "next/link";
import Stripe from "stripe";
import type { Metadata } from "next";
import { EmailSignup } from "@/components/EmailSignup";
import { SubscriberCount } from "@/components/SubscriberCount";
import { EyeDivider } from "@/components/Eyes";

export const metadata: Metadata = {
  title: "Thank you",
  description: "Reader-supported. Thank you for backing the work.",
};

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
    })
  : null;

function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}

function firstNameOf(fullName: string | null): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

type SessionInfo = {
  amount: string | null;
  donorName: string | null;
  donorMessage: string | null;
};

async function getSessionInfo(
  sessionId: string | undefined
): Promise<SessionInfo> {
  if (!sessionId || !stripe) {
    return { amount: null, donorName: null, donorMessage: null };
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const amount =
      typeof session.amount_total === "number"
        ? formatUsd(session.amount_total)
        : null;
    const rawName = session.metadata?.donor_name;
    const donorName =
      typeof rawName === "string" && rawName.trim().length > 0
        ? rawName
        : null;
    const rawNote = session.metadata?.donor_message;
    const donorMessage =
      typeof rawNote === "string" && rawNote.trim().length > 0
        ? rawNote
        : null;
    return { amount, donorName, donorMessage };
  } catch {
    return { amount: null, donorName: null, donorMessage: null };
  }
}

export default async function TipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const { session_id } = params;
  const previewName =
    process.env.NODE_ENV !== "production"
      ? (params as { preview_name?: string }).preview_name
      : undefined;
  const previewAmount =
    process.env.NODE_ENV !== "production"
      ? (params as { preview_amount?: string }).preview_amount
      : undefined;
  const sessionInfo = await getSessionInfo(session_id);
  const donorName = previewName ?? sessionInfo.donorName;
  const amount = previewAmount ?? sessionInfo.amount;
  const donorMessage = sessionInfo.donorMessage;
  const firstName = firstNameOf(donorName);
  const greeting = firstName ? `thanks, ${firstName}.` : "thanks.";

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
        <p className="eyebrow mb-6 fade-up stagger-1">
          Reader-funded writing
        </p>

        {/* The letter. Display italic in the publication voice. */}
        <div
          className="font-display italic text-ink leading-[1.25] mx-auto fade-up stagger-2"
          style={{ fontSize: "clamp(1.45rem, 3vw, 1.95rem)", fontWeight: 400 }}
        >
          <p className="mb-6">
            {greeting} this is what reader-funded writing looks like.
          </p>
          <p className="mb-6">
            the most valuable thing you can do next is send the work to
            one person who&apos;d get it. one share is worth more than
            the contribution that just happened.
          </p>
          <p>
            stay close,
            <br />
            ~ Clay
          </p>
        </div>

        {/* Receipt details */}
        {amount && (
          <p className="text-xs uppercase tracking-[0.18em] text-ink-faint mt-10 fade-up stagger-3">
            Your contribution: {amount}
          </p>
        )}

        {donorMessage && (
          <div className="mt-8 max-w-md mx-auto fade-up stagger-4">
            <p className="eyebrow mb-3">Your note</p>
            <blockquote
              className="font-display italic text-ink leading-snug border-l-2 border-eye pl-5 py-1 text-left"
              style={{ fontSize: "1.05rem", fontWeight: 400 }}
            >
              {donorMessage}
            </blockquote>
          </div>
        )}
      </section>

      <EyeDivider />

      {/* Membership upsell. A tipper just paid once, so the honest next
          step is the recurring path. Sits below the share (which matters
          most) and reads as an invitation, not a hard sell. */}
      <section className="max-w-2xl mx-auto px-6 pb-4 text-center">
        <p className="eyebrow mb-3">If you want to do this every month</p>
        <p className="deck mb-6 max-w-md mx-auto">
          You backed this once. Members back it every month, and get the
          room behind the work. The comments, the desk, the book built in
          the open.
        </p>
        <Link href="/membership?src=tip" className="btn-primary">
          <span>Join the room</span>
        </Link>
      </section>

      <EyeDivider />

      {/* Email signup, in case the contributor isn't on the list yet. */}
      <section className="max-w-2xl mx-auto px-6 pb-16 text-center">
        <p className="eyebrow mb-3">If you&apos;re not on the list</p>
        <p className="deck mb-6 max-w-md mx-auto">
          Tipping doesn&apos;t subscribe you. If you want the next one in
          your inbox.
        </p>
        <SubscriberCount className="mb-5" />
        <div className="flex justify-center">
          <EmailSignup />
        </div>
      </section>

      <div className="text-center pb-16">
        <Link
          href="/"
          className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
          style={{ fontWeight: 500 }}
        >
          ← back to stop being prey
        </Link>
      </div>
    </div>
  );
}
