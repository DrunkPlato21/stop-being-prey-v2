import Link from "next/link";
import type { Metadata } from "next";
import {
  getProfile,
  listFlaggedProfiles,
  type Profile,
} from "@/lib/comments";
import { getMember, listAllMemberEmails } from "@/lib/members";
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
  tier: "founder" | "regular" | null;
  founderSlot: number | null;
  createdAt: number | null;
};

async function loadMember(email: string): Promise<MemberRow> {
  const [profile, member] = await Promise.all([
    getProfile(email).catch(() => null),
    getMember(email).catch(() => null),
  ]);
  return {
    email,
    profile,
    tier: member?.tier ?? null,
    founderSlot: member?.founderSlot ?? null,
    createdAt: member?.createdAt ?? profile?.createdAt ?? null,
  };
}

export default async function AdminMembersPage() {
  const [allEmails, flaggedEmails] = await Promise.all([
    listAllMemberEmails(),
    listFlaggedProfiles(),
  ]);

  const flaggedSet = new Set(flaggedEmails);
  const rows = await Promise.all(allEmails.map(loadMember));

  // Pre-split so "needs review" stays visible at the top regardless of
  // the member's createdAt position.
  const flaggedRows = rows.filter((r) => flaggedSet.has(r.email));
  const regularRows = rows.filter((r) => !flaggedSet.has(r.email));

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
      </p>

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
