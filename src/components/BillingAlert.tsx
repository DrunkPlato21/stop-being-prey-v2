import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { describeDecline } from "@/lib/billing-copy";
import { isInDunning, type MemberRecord } from "@/lib/members";

// The failed-renewal bar at the top of the members-area account page.
//
// Until this existed, /notes/account rendered identically for a member
// in good standing and a member three declines deep: same medallion,
// same locked rate, same neutral "update card, switch plans, or cancel"
// line. A member who came specifically to sort out a failed payment
// found a page behaving as though nothing had happened, and left. That
// is not a copy problem, it is a page that never read member.status.
//
// Every sentence here is sourced from what Stripe actually told us
// (lib/members.ts BillingFailure), and every one of those fields can be
// missing, so the copy degrades a step at a time instead of inventing a
// reason. The one thing it never does is guess at an expired card.

function formatDate(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function formatAmount(cents: number | null | undefined): string | null {
  if (typeof cents !== "number") return null;
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

/** "your Visa ending 1644", when Stripe told us which card it was. */
function cardPhrase(brand: string | null, last4: string | null): string | null {
  if (!last4) return null;
  const label = brand
    ? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
    : "card";
  return `your ${label} ending ${last4}`;
}

export function BillingAlert({ member }: { member: MemberRecord | null }) {
  if (!isInDunning(member) || !member) return null;

  const failure = member.billingFailure ?? null;
  // Retries left is the fact that changes the whole tone of the bar, so
  // it drives the headline rather than sitting in the body. Missing data
  // reads as "retries left": the softer of the two, and the wrong guess
  // in that direction costs a bit of urgency instead of frightening
  // someone whose seat is fine.
  const retriesLeft = failure ? failure.nextAttemptAt !== null : true;
  const nextAttempt = formatDate(failure?.nextAttemptAt ?? null);
  const failedOn = formatDate(failure?.failedAt ?? null);
  const amount = formatAmount(failure?.amountCents ?? member.amountCents);
  const reason = describeDecline(failure?.declineCode);
  const card = cardPhrase(
    failure?.cardBrand ?? null,
    failure?.cardLast4 ?? null
  );

  // A locked slot rate is the one thing that does not come back if the
  // seat lapses, so it is named explicitly for the members who have one.
  const lockedRate =
    (member.tier === "founder" && member.founderSlot) ||
    (member.tier === "charter" && member.charterSlot)
      ? `the ${amount ?? ""}${amount ? " " : ""}rate you locked`.trim()
      : null;

  // "Use a different card" when we know the card itself is fine and the
  // problem was money or a bank block. Telling someone to update a card
  // that works is how a system announces it isn't listening.
  const ctaLabel =
    failure?.declineCode === "insufficient_funds"
      ? "Use a different card"
      : "Update the card";

  const openingLine = [
    amount ? `The ${amount} renewal` : "Your renewal",
    failedOn ? `was declined on ${failedOn}` : "was declined",
    card ? `on ${card}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="mb-12 md:mb-14 border border-rule bg-surface"
      style={{ borderLeftWidth: "3px", borderLeftColor: "var(--blood)" }}
    >
      <div className="px-5 py-6 md:px-7 md:py-7">
        <p className="eyebrow mb-3" style={{ color: "var(--blood)" }}>
          {retriesLeft ? "Payment failed" : "Last attempt"}
        </p>

        <h2
          className="font-display text-ink leading-tight tracking-tight mb-4"
          style={{
            fontSize: "clamp(1.35rem, 3.5vw, 1.75rem)",
            fontWeight: 600,
            letterSpacing: "-0.015em",
          }}
        >
          {retriesLeft
            ? "Your renewal didn't go through."
            : "This is the last try on your seat."}
        </h2>

        <p
          className="font-serif text-ink-muted leading-relaxed mb-4"
          style={{ fontSize: "1.02rem" }}
        >
          {openingLine}
          {reason ? `, because ${reason}` : ""}.{" "}
          {retriesLeft ? (
            nextAttempt ? (
              <>
                Stripe tries again on{" "}
                <strong className="text-ink">{nextAttempt}</strong>. Sort the
                card before then and it goes through on its own.
              </>
            ) : (
              <>
                Stripe will retry it automatically. Sort the card and it goes
                through on its own.
              </>
            )
          ) : (
            <>
              There is no automatic retry left. When this one closes out, the
              seat closes with it
              {lockedRate ? `, and ${lockedRate} goes with it` : ""}.
            </>
          )}
        </p>

        <div className="mb-5">
          <ManageSubscriptionButton label={ctaLabel} />
        </div>

        <p
          className="font-serif italic text-ink-muted leading-relaxed"
          style={{ fontSize: "0.9rem" }}
        >
          {retriesLeft
            ? "Nothing has changed on your end today. Everything stays open while this sorts itself out."
            : "If you'd rather step away, you don't have to do anything. It closes on its own, and the writing stays free either way."}
        </p>
      </div>
    </div>
  );
}
