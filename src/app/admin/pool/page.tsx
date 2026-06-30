import Link from "next/link";
import type { Metadata } from "next";
import {
  getPoolRequestsByIds,
  getPoolStats,
  listRecentRequestIds,
  listWaitlistRequestIds,
  type PoolRequest,
} from "@/lib/pool";
import { getSourceCounts, type EventCounts } from "@/lib/analytics";
import { markSectionSeen } from "@/lib/admin-nav-badges";

// Community seat pool, admin view. Localhost only (proxy.ts 404s /admin
// in prod), so it reads the PROD keyspace by default to show the real
// live pool. `?ns=dev` switches to the dev sandbox for inspecting seats
// funded/claimed during local testing.
//
// This is the ONLY surface where the claimers' optional notes are shown
// (private by design; never public). Numbers-only on the public counter.

export const metadata: Metadata = {
  title: "Seat pool, admin",
  description: "Community seat pool: funded, claimed, waitlist, notes.",
};

export const dynamic = "force-dynamic";

function n(counts: EventCounts, key: keyof EventCounts): number {
  return counts[key] ?? 0;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function when(ms: number | null | undefined): string {
  if (typeof ms !== "number") return "—";
  return new Date(ms).toLocaleString();
}

export default async function PoolAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const dev = params.ns === "dev";
  const prod = !dev;

  // Clear the unread dot for the seat pool. Awaited so the seen mark lands
  // in Redis before AdminPersistentNav re-fetches the layout's badges. The
  // dot tracks pool:requests:all (prod), so a visit here clears it.
  await markSectionSeen("pool").catch(() => null);

  const [stats, sources, waitlistIds, recentIds] = await Promise.all([
    getPoolStats({ prod }),
    getSourceCounts(dev),
    listWaitlistRequestIds({ prod }),
    listRecentRequestIds(50, { prod }),
  ]);

  const [waitlist, recent] = await Promise.all([
    getPoolRequestsByIds(waitlistIds, { prod }),
    getPoolRequestsByIds(recentIds, { prod }),
  ]);

  const pool = sources.get("pool") ?? {};

  return (
    <div className="max-w-5xl mx-auto px-6 pt-12 md:pt-16 pb-24">
      <header className="mb-8">
        <p className="eyebrow mb-2">Admin · Seat pool</p>
        <h1
          className="font-display text-ink tracking-tight"
          style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 700 }}
        >
          Community seat pool
        </h1>
        <p className="font-serif text-ink-muted mt-3 leading-relaxed">
          Anonymous both ways. Reading{" "}
          <strong className="text-ink">
            {dev ? "dev (local)" : "production"}
          </strong>{" "}
          state.{" "}
          <Link
            href={dev ? "/admin/pool" : "/admin/pool?ns=dev"}
            className="text-eye-deep hover:text-ink underline"
          >
            {dev ? "View production" : "View dev"}
          </Link>
        </p>
      </header>

      {/* Live pool state (operational counters, not analytics). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <Stat label="Funded" value={stats.funded} />
        <Stat label="Claimed" value={stats.claimed} />
        <Stat label="Available" value={stats.available} />
        <Stat label="Waiting" value={stats.waiting} />
      </div>

      {/* Funnel (analytics source "pool"). */}
      <h2 className="eyebrow mb-3">Funnel</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-2xl mb-12">
        <Stat label="Fund started" value={n(pool, "pool_fund_started")} />
        <Stat label="Funded (paid)" value={n(pool, "pool_funded")} />
        <Stat label="Requested" value={n(pool, "pool_requested")} />
        <Stat
          label="Confirmed"
          value={n(pool, "pool_confirmed")}
          sub={pct(n(pool, "pool_confirmed"), n(pool, "pool_requested")) + " of requested"}
        />
        <Stat label="Claimed" value={n(pool, "pool_claimed")} />
        <Stat label="Waitlisted" value={n(pool, "pool_waitlisted")} />
      </div>

      {/* Waitlist, front of line first. Private. */}
      <h2 className="eyebrow mb-3">Waitlist ({waitlist.length})</h2>
      <RequestTable rows={waitlist} empty="Nobody is waiting." showPosition />

      {/* Recent requests + their private notes. */}
      <h2 className="eyebrow mt-12 mb-3">Recent requests</h2>
      <RequestTable rows={recent} empty="No requests yet." />

      <p className="font-serif italic text-ink-faint text-sm mt-8 leading-relaxed max-w-2xl">
        Notes are private to this page. The public counter shows numbers
        only, never a name, an email, or a note.
      </p>
    </div>
  );
}

function RequestTable({
  rows,
  empty,
  showPosition = false,
}: {
  rows: PoolRequest[];
  empty: string;
  showPosition?: boolean;
}) {
  return (
    <div className="overflow-x-auto border border-rule">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="text-left text-ink-faint uppercase tracking-wider">
            {showPosition && <Th className="text-left">#</Th>}
            <Th className="text-left">Email</Th>
            <Th className="text-left">Status</Th>
            <Th className="text-left">Note</Th>
            <Th className="text-left">When</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-rule align-top">
              {showPosition && <Td className="text-left">{i + 1}</Td>}
              <Td className="text-left">{r.email}</Td>
              <Td className="text-left">{r.status}</Td>
              <Td className="text-left">
                {r.note ? (
                  <span className="text-ink">{r.note}</span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </Td>
              <Td className="text-left">
                {when(r.grantedAt ?? r.confirmedAt ?? r.createdAt)}
              </Td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-rule">
              <Td
                className="text-left text-ink-faint"
                colSpan={showPosition ? 5 : 4}
              >
                {empty}
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="border border-rule p-4">
      <p className="eyebrow text-ink-faint mb-1">{label}</p>
      <p
        className="font-display text-ink"
        style={{ fontSize: "1.8rem", fontWeight: 700 }}
      >
        {value.toLocaleString()}
      </p>
      {sub && <p className="text-xs text-ink-faint mt-1">{sub}</p>}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-right font-medium text-[0.68rem] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-2 text-right ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
