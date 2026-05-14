import Link from "next/link";
import type { Metadata } from "next";
import {
  ALL_STATUSES,
  ALL_TIERS,
  listAll,
  statusLabel,
  tierLabel,
  type CaseStatus,
  type CaseTier,
} from "@/lib/case-submissions";
import { CaseSubmissionRow } from "@/components/CaseSubmissionRow";

export const metadata: Metadata = {
  title: "Case Submissions, admin",
};

export const dynamic = "force-dynamic";

// Admin inbox for case submissions. HTTP Basic auth gates /admin/*
// via proxy.ts — anyone landing here is Clay.
//
// Filters are URL-driven (?tier=&status=) so the chrome can stay a
// server component and the back button works.

type Search = { tier?: string; status?: string };

function parseTier(input?: string): CaseTier | undefined {
  if (input === "free" || input === "public_review" || input === "private_review") {
    return input;
  }
  return undefined;
}

function parseStatus(input?: string): CaseStatus | undefined {
  if (input && (ALL_STATUSES as readonly string[]).includes(input)) {
    return input as CaseStatus;
  }
  return undefined;
}

export default async function CaseSubmissionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const tier = parseTier(params.tier);
  const status = parseStatus(params.status);

  const submissions = await listAll({ tier, status, limit: 200 });

  const tierFilters: Array<{
    href: string;
    label: string;
    active: boolean;
  }> = [
    {
      href: buildHref({ tier: undefined, status }),
      label: "All",
      active: !tier,
    },
    ...ALL_TIERS.map((t) => ({
      href: buildHref({ tier: t, status }),
      label: tierLabel(t),
      active: tier === t,
    })),
  ];

  const statusFilters: Array<{
    href: string;
    label: string;
    active: boolean;
  }> = [
    {
      href: buildHref({ tier, status: undefined }),
      label: "All",
      active: !status,
    },
    ...ALL_STATUSES.map((s) => ({
      href: buildHref({ tier, status: s }),
      label: statusLabel(s),
      active: status === s,
    })),
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <Link
        href="/admin/desk"
        className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
        style={{ fontSize: "0.65rem", fontWeight: 500 }}
      >
        &larr; Writer&apos;s Desk
      </Link>

      <h1
        className="font-display text-ink leading-tight tracking-tight mt-4 mb-3"
        style={{
          fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Case Submissions
      </h1>

      <p
        className="font-serif italic text-ink-muted mb-10 leading-relaxed"
        style={{ fontSize: "1rem" }}
      >
        Member-submitted cases. Free goes in immediately; paid lands
        as &ldquo;Paid&rdquo; once Stripe confirms. Mark in-review
        when you start work, published / completed when done.
      </p>

      <FilterRow label="Tier" items={tierFilters} />
      <FilterRow label="Status" items={statusFilters} />

      <p
        className="font-display uppercase text-ink-faint mt-8"
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.22em",
          fontWeight: 600,
        }}
      >
        {submissions.length}{" "}
        {submissions.length === 1 ? "case" : "cases"}
        {tier || status ? " matching" : " total"}
      </p>

      {submissions.length === 0 ? (
        <p
          className="font-serif italic text-ink-faint mt-6"
          style={{ fontSize: "1rem" }}
        >
          Nothing here. Submissions land in real time.
        </p>
      ) : (
        <div className="mt-4">
          {submissions.map((s) => (
            <CaseSubmissionRow key={s.id} row={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; label: string; active: boolean }>;
}) {
  return (
    <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1.5 mb-3">
      <span
        className="font-display uppercase text-eye-deep"
        style={{
          fontSize: "0.6rem",
          letterSpacing: "0.24em",
          fontWeight: 700,
          minWidth: "3.5rem",
        }}
      >
        {label}
      </span>
      {items.map((item) => (
        <Link
          key={item.href + item.label}
          href={item.href}
          className="font-display uppercase tracking-[0.22em] no-underline transition-colors"
          style={{
            fontSize: "0.66rem",
            fontWeight: 600,
            color: item.active ? "var(--ink)" : "var(--ink-faint)",
            borderBottom: item.active
              ? "1px solid var(--eye-deep)"
              : "1px solid transparent",
            paddingBottom: "1px",
          }}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function buildHref(args: { tier?: CaseTier; status?: CaseStatus }): string {
  const search = new URLSearchParams();
  if (args.tier) search.set("tier", args.tier);
  if (args.status) search.set("status", args.status);
  const qs = search.toString();
  return qs ? `/admin/case-submissions?${qs}` : "/admin/case-submissions";
}
