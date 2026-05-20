import Link from "next/link";
import type { Metadata } from "next";
import { getCheckoutSessionInfo } from "@/lib/membership";
import { pollMemberBySession, type MemberRecord } from "@/lib/members";
import { createMagicLink } from "@/lib/auth";
import { sendMagicLink } from "@/lib/email";

export const metadata: Metadata = {
  title: "Welcome inside",
  description: "Your membership is live. The Field Notes archive is open.",
};

// Stripe redirects new members here after a successful Checkout. We:
//   1. Pull session metadata + email + customer id from Stripe.
//   2. Briefly poll Upstash for the webhook-written member record so
//      we can surface tier + founder slot # if the user got one.
//   3. Mint a magic link and send the welcome email.
//
// The webhook is the authority on tier — this page just reads what it
// wrote. If the webhook hasn't fired yet (or fails) we degrade to a
// neutral "subscription is being set up" message.

function formatDollars(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

type TierOutcome =
  | { kind: "founder"; slot: number; member: MemberRecord }
  | { kind: "charter"; slot: number; member: MemberRecord }
  | { kind: "regular"; member: MemberRecord }
  | { kind: "missed-founder"; member: MemberRecord }
  | { kind: "missed-charter"; member: MemberRecord }
  | { kind: "pending" };

function resolveOutcome(
  member: MemberRecord | null,
  intended: "founder" | "charter" | "regular"
): TierOutcome {
  if (!member) return { kind: "pending" };
  if (member.tier === "founder" && member.founderSlot) {
    return { kind: "founder", slot: member.founderSlot, member };
  }
  if (member.tier === "charter" && member.charterSlot) {
    return { kind: "charter", slot: member.charterSlot, member };
  }
  if (intended === "founder") {
    return { kind: "missed-founder", member };
  }
  if (intended === "charter") {
    return { kind: "missed-charter", member };
  }
  return { kind: "regular", member };
}

export default async function MembershipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let email: string | null = null;
  let dispatched = false;
  let sendError: string | null = null;
  let outcome: TierOutcome = { kind: "pending" };

  if (session_id) {
    const info = await getCheckoutSessionInfo(session_id);
    if (info?.email && info.customerId) {
      email = info.email;
      const intended: "founder" | "charter" | "regular" =
        info.metadata.tier_at_checkout === "founder"
          ? "founder"
          : info.metadata.tier_at_checkout === "charter"
            ? "charter"
            : "regular";

      // Poll briefly for the webhook to land the member record. ~1.2s
      // budget total. The Stripe redirect happens fast enough that the
      // webhook is usually already there, but in dev (or under load)
      // we want to give it a beat.
      const member = await pollMemberBySession(session_id);
      outcome = resolveOutcome(member, intended);

      // Magic link send — same flow as before. Failure here is logged
      // (in dev) but doesn't gate the page.
      const id = await createMagicLink({
        email: info.email,
        customerId: info.customerId,
        next: "/desk",
      }).catch(() => null);
      if (id) {
        const baseUrl = (
          process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
        ).replace(/\/$/, "");
        const url = `${baseUrl}/api/auth/callback?token=${encodeURIComponent(id)}`;
        const result = await sendMagicLink({ to: info.email, url });
        if (result.ok) {
          dispatched = true;
        } else {
          sendError = result.error;
        }
      }
    }
  }

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-12 text-center">
        <p className="eyebrow mb-6 fade-up stagger-1">You&apos;re in</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6 fade-up stagger-2"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Welcome inside.
        </h1>

        {/* Founder badge block — only renders for the first 100 paid
            members. Echoes the in-thread FOUNDER chip's visual language
            (filled olive interior, cream text, Cormorant uppercase with
            wide letter-spacing) but scaled up for this welcome moment.
            The slot number drops out of small-caps so the digit reads
            at its intended size with lining figures. */}
        {outcome.kind === "founder" && (
          <div className="flex justify-center mb-10 fade-up stagger-3">
            <div
              className="member-chip member-chip-founder"
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                padding: "1.2rem 2.1rem",
                fontSize: "1rem",
                letterSpacing: "0.18em",
                lineHeight: 1.35,
                whiteSpace: "normal",
              }}
            >
              <span>
                You&apos;re Founder{" "}
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "1.55em",
                    letterSpacing: 0,
                    textTransform: "none",
                    fontVariantNumeric: "lining-nums",
                    fontFeatureSettings: '"lnum" 1',
                  }}
                >
                  №{outcome.slot}
                </span>
                .
              </span>
              <span style={{ fontSize: "0.78em", opacity: 0.92 }}>
                Locked at {formatDollars(outcome.member.amountCents)}/
                {outcome.member.interval === "year" ? "yr" : "mo"} for life.
              </span>
            </div>
          </div>
        )}

        {/* Charter badge block — for the 200 members who claimed a slot
            after the founder cap filled. Same chassis as the founder
            block; bronze fill via the .member-chip-charter modifier. */}
        {outcome.kind === "charter" && (
          <div className="flex justify-center mb-10 fade-up stagger-3">
            <div
              className="member-chip member-chip-charter"
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                padding: "1.2rem 2.1rem",
                fontSize: "1rem",
                letterSpacing: "0.18em",
                lineHeight: 1.35,
                whiteSpace: "normal",
              }}
            >
              <span>
                You&apos;re Charter{" "}
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: "1.55em",
                    letterSpacing: 0,
                    textTransform: "none",
                    fontVariantNumeric: "lining-nums",
                    fontFeatureSettings: '"lnum" 1',
                  }}
                >
                  №{outcome.slot}
                </span>
                .
              </span>
              <span style={{ fontSize: "0.78em", opacity: 0.92 }}>
                Badge locked for life.
              </span>
            </div>
          </div>
        )}

        {/* Missed-founder edge case: paid expecting the founder rate
            but slot 100 filled mid-checkout. They need to know they're
            on the regular rate, not the floor. Subtle italic note,
            positioned where the founder badge would have lived. */}
        {outcome.kind === "missed-founder" && (
          <p
            className="font-display italic text-ink-muted mb-10 fade-up stagger-3"
            style={{ fontSize: "0.95rem" }}
          >
            the last founder slot filled while you were checking out.
            you&apos;re in at {formatDollars(outcome.member.amountCents)}/
            {outcome.member.interval === "year" ? "yr" : "mo"}, and that
            rate stays.
          </p>
        )}

        {/* Missed-charter edge case: paid during the charter window but
            the cap filled mid-checkout. They're on the regular tier. */}
        {outcome.kind === "missed-charter" && (
          <p
            className="font-display italic text-ink-muted mb-10 fade-up stagger-3"
            style={{ fontSize: "0.95rem" }}
          >
            the last charter slot filled while you were checking out.
            you&apos;re in at {formatDollars(outcome.member.amountCents)}/
            {outcome.member.interval === "year" ? "yr" : "mo"} as a regular
            member.
          </p>
        )}

        <div
          className="font-display italic text-ink leading-[1.4] mx-auto fade-up stagger-4 max-w-xl"
          style={{
            fontSize: "clamp(1.15rem, 2.3vw, 1.45rem)",
            fontWeight: 400,
          }}
        >
          {dispatched && email ? (
            <p className="mb-5">
              Your sign-in link is on its way to{" "}
              <span className="not-italic font-display text-eye-deep">
                {email}
              </span>
              . Click it to step into the room.
            </p>
          ) : email ? (
            <p className="mb-5">
              Your sign-in link is queued for{" "}
              <span className="not-italic font-display text-eye-deep">
                {email}
              </span>
              . If it doesn&apos;t arrive in a minute, send a new one
              below.
            </p>
          ) : (
            <p className="mb-5">
              Your sign-in link is queued. Check your inbox in a moment.
            </p>
          )}

          <p>
            stay close,
            <br />~ Clay
          </p>
        </div>

        {/* Fallback for non-arrived emails. Smaller, muted, sits
            below the letter so it reads as a postscript rather than
            competing with the main message. */}
        <div className="mt-12 flex flex-col items-center gap-3">
          <p
            className="font-display italic text-ink-muted"
            style={{ fontSize: "0.95rem" }}
          >
            Didn&apos;t see it? Check your spam folder. Otherwise:
          </p>
          <Link
            href="/notes/sign-in"
            className="btn-secondary"
            style={{
              fontSize: "0.68rem",
              padding: "0.6rem 1.15rem",
              letterSpacing: "0.2em",
            }}
          >
            <span>send a new link</span>
          </Link>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/"
            className="text-ink-muted hover:text-eye-deep font-display text-sm uppercase tracking-[0.18em] no-underline transition-colors"
            style={{ fontWeight: 500 }}
          >
            ← back home
          </Link>
        </div>

        {sendError && process.env.NODE_ENV !== "production" && (
          <p className="mt-8 text-xs italic text-ink-faint">
            (dev) email send error: {sendError}
          </p>
        )}
      </section>
    </div>
  );
}
