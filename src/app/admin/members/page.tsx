import Link from "next/link";
import type { Metadata } from "next";
import {
  getProfile,
  listFlaggedProfiles,
  type Profile,
} from "@/lib/comments";
import {
  getMember,
  isInDunning,
  listAllMemberEmails,
  type BillingFailure,
  type MemberSubscriptionStatus,
} from "@/lib/members";
import { declineLabel } from "@/lib/billing-copy";
import { AdminRenameMemberForm } from "@/components/AdminRenameMemberForm";

// Admin members surface. Gated by proxy.ts via HTTP Basic auth on
// /admin/*. Shows every member newest-first with their current display
// name and a rename action. Members whose name flagged borderline at
// write-time float to a "needs review" section at the top.

export const metadata: Metadata = {
  title: "Members, admin",
  description: "Member roster + display-name management.",
};

export const dynamic = "force-dynamic";

function formatDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type MemberRow = {
  email: string;
  profile: Profile | null;
  tier: "founder" | "charter" | "regular" | null;
  founderSlot: number | null;
  charterSlot: number | null;
  createdAt: number | null;
  status: MemberSubscriptionStatus | null;
  amountCents: number | null;
  interval: "month" | "year" | null;
  billingFailure: BillingFailure | null;
};

async function loadMember(email: string): Promise<MemberRow> {
  const [profile, member] = await Promise.all([
    getProfile(email).catch(() => null),
    // Read the live roster read-only, even from a sandboxed local dev
    // box (KEY_PREFIX="" in production makes this a no-op there).
    getMember(email, { prod: true }).catch(() => null),
  ]);
  return {
    email,
    profile,
    tier: member?.tier ?? null,
    founderSlot: member?.founderSlot ?? null,
    charterSlot: member?.charterSlot ?? null,
    createdAt: member?.createdAt ?? profile?.createdAt ?? null,
    status: member?.status ?? null,
    amountCents: member?.amountCents ?? null,
    interval: member?.interval ?? null,
    billingFailure: member?.billingFailure ?? null,
  };
}

/** "$25/mo", when we know both halves. */
function rateLabel(row: MemberRow): string | null {
  if (typeof row.amountCents !== "number") return null;
  const dollars = row.amountCents / 100;
  const rendered = Number.isInteger(dollars) ? dollars : dollars.toFixed(2);
  return `$${rendered}/${row.interval === "year" ? "yr" : "mo"}`;
}

/**
 * One line of everything known about a failing renewal.
 *
 * Records that went delinquent before the webhook started keeping the
 * decline details have no billingFailure at all, so this degrades to
 * just the status. That absence is itself worth seeing: it marks the
 * members whose failure we can't explain without opening Stripe.
 */
function failureLine(row: MemberRow): string {
  const parts: string[] = [row.status ?? "unknown"];
  const rate = rateLabel(row);
  if (rate) parts.push(rate);

  const failure = row.billingFailure;
  if (!failure) {
    parts.push("no decline on record");
    return parts.join(" · ");
  }

  const reason = declineLabel(failure.declineCode);
  const card = failure.cardLast4
    ? `${failure.cardBrand ?? "card"} ${failure.cardLast4}`
    : null;
  if (reason) parts.push(card ? `${reason} on ${card}` : reason);
  else if (card) parts.push(`declined on ${card}`);

  parts.push(`attempt ${failure.attemptCount}`);
  parts.push(`last tried ${formatDate(failure.failedAt)}`);
  parts.push(
    failure.nextAttemptAt
      ? `next ${formatDate(failure.nextAttemptAt)}`
      : "no retries left"
  );
  return parts.join(" · ");
}

export default async function AdminMembersPage() {
  const [allEmails, flaggedEmails] = await Promise.all([
    listAllMemberEmails({ prod: true }),
    listFlaggedProfiles(),
  ]);

  const flaggedSet = new Set(flaggedEmails);
  const rows = await Promise.all(allEmails.map(loadMember));

  // Pre-split so "needs review" stays visible at the top regardless of
  // the member's createdAt position. Failing renewals get the same
  // treatment: a member whose card is dying was previously invisible
  // here, discoverable only by running scan-delinquent.mjs, which meant
  // the first sign of trouble was noticing them wander the site.
  const flaggedRows = rows.filter((r) => flaggedSet.has(r.email));
  const delinquentRows = rows
    .filter((r) => !flaggedSet.has(r.email) && isInDunning(r))
    .sort(
      (a, b) =>
        (b.billingFailure?.failedAt ?? 0) - (a.billingFailure?.failedAt ?? 0)
    );
  const regularRows = rows.filter(
    (r) => !flaggedSet.has(r.email) && !isInDunning(r)
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <div className="flex items-baseline justify-between gap-4 mb-8 flex-wrap">
        <h1
          className="font-display text-ink leading-tight tracking-tight"
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Members.
        </h1>
        <Link
          href="/admin/desk"
          className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
          style={{ fontSize: "0.7rem", fontWeight: 600 }}
        >
          back to desk &rarr;
        </Link>
      </div>

      <p className="font-serif italic text-ink-muted mb-10">
        {rows.length} {rows.length === 1 ? "member" : "members"} on file.
        {flaggedRows.length > 0 && (
          <> {flaggedRows.length} flagged for review.</>
        )}
        {delinquentRows.length > 0 && (
          <>
            {" "}
            <span style={{ color: "var(--blood)" }}>
              {delinquentRows.length}{" "}
              {delinquentRows.length === 1 ? "is" : "are"} failing to renew.
            </span>
          </>
        )}
      </p>

      {delinquentRows.length > 0 && (
        <section className="mb-14">
          <h2
            className="font-display text-ink mb-5"
            style={{ fontSize: "1.1rem", fontWeight: 700 }}
          >
            Failing renewals
          </h2>
          <ul className="flex flex-col">
            {delinquentRows.map((row, idx) => (
              <li
                key={row.email}
                className={idx === 0 ? "py-5" : "py-5 border-t border-rule"}
                style={{
                  background: "var(--paper-deep)",
                  borderLeft: "2px solid var(--blood)",
                  paddingLeft: "1rem",
                }}
              >
                <MemberRowView row={row} flagged={false} />
                <p
                  className="font-serif italic mt-1"
                  style={{ fontSize: "0.8rem", color: "var(--blood)" }}
                >
                  {failureLine(row)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {flaggedRows.length > 0 && (
        <section className="mb-14">
          <h2
            className="font-display text-ink mb-5"
            style={{ fontSize: "1.1rem", fontWeight: 700 }}
          >
            Needs review
          </h2>
          <ul className="flex flex-col">
            {flaggedRows.map((row, idx) => (
              <li
                key={row.email}
                className={idx === 0 ? "py-5" : "py-5 border-t border-rule"}
                style={{
                  background: "var(--paper-deep)",
                  borderLeft: "2px solid var(--eye-deep)",
                  paddingLeft: "1rem",
                }}
              >
                <MemberRowView row={row} flagged />
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2
        className="font-display text-ink mb-5"
        style={{ fontSize: "1.1rem", fontWeight: 700 }}
      >
        All members
      </h2>
      {regularRows.length === 0 ? (
        <p className="font-serif italic text-ink-muted">
          No members on file yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {regularRows.map((row, idx) => (
            <li
              key={row.email}
              className={idx === 0 ? "py-5" : "py-5 border-t border-rule"}
            >
              <MemberRowView row={row} flagged={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberRowView({
  row,
  flagged,
}: {
  row: MemberRow;
  flagged: boolean;
}) {
  const displayName = row.profile?.displayName ?? "";
  const fallbackName = row.email.split("@")[0] ?? row.email;
  const shown = displayName || `(unset — fallback: ${fallbackName})`;
  const legalName = [row.profile?.firstName, row.profile?.lastName]
    .filter(Boolean)
    .join(" ");
  const lastChange = row.profile?.displayNameHistory?.[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p
            className="font-display text-ink leading-tight"
            style={{
              fontSize: "1.02rem",
              fontWeight: displayName ? 600 : 500,
              color: displayName ? "var(--ink)" : "var(--ink-muted)",
            }}
          >
            {shown}
          </p>
          <p
            className="font-serif italic text-ink-faint"
            style={{ fontSize: "0.82rem" }}
          >
            {row.email}
            {row.tier === "founder" && row.founderSlot !== null && (
              <> · founder #{row.founderSlot}</>
            )}
            {row.tier === "charter" && row.charterSlot !== null && (
              <> · charter #{row.charterSlot}</>
            )}
            {row.tier === "regular" && <> · regular</>}
            {legalName && <> · {legalName}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {flagged && (
            <span
              className="font-display uppercase"
              style={{
                fontSize: "0.6rem",
                fontWeight: 700,
                color: "var(--eye-deep)",
                background: "var(--paper)",
                border: "1px solid var(--eye-deep)",
                padding: "0.15rem 0.5rem",
                letterSpacing: "0.22em",
              }}
            >
              Flagged
            </span>
          )}
          <AdminRenameMemberForm
            memberEmail={row.email}
            currentDisplayName={displayName || fallbackName}
          />
        </div>
      </div>
      {lastChange && (
        <p
          className="font-serif italic text-ink-faint"
          style={{ fontSize: "0.78rem" }}
        >
          Last change {formatDate(lastChange.changedAt)} (was &ldquo;{lastChange.previous}&rdquo;)
          {lastChange.changedBy === "admin" && (
            <> · by admin</>
          )}
        </p>
      )}
    </div>
  );
}
