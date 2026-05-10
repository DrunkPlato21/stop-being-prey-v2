import { listAllPending, isStorageConfigured } from "@/lib/wallDonations";
import { getAllWalls } from "@/lib/walls";
import { AdminDonationRow } from "./AdminDonationRow";

export const metadata = {
  title: "Admin · Walls",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminWallsPage() {
  if (!isStorageConfigured()) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="italic text-ink-muted">
          Wall storage is not configured (UPSTASH_REDIS_REST_URL / TOKEN
          missing).
        </p>
      </div>
    );
  }

  const [pending, walls] = await Promise.all([
    listAllPending(),
    Promise.resolve(getAllWalls()),
  ]);
  const wallTitles = new Map(walls.map((w) => [w.slug, w.title]));

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-8">
        <p className="eyebrow mb-2">Admin · Walls</p>
        <h1
          className="font-display text-ink leading-tight tracking-tight"
          style={{
            fontSize: "2rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Pending notes
        </h1>
      </div>

      {pending.length === 0 ? (
        <p className="italic text-ink-muted">No notes waiting for review.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {pending.map((d) => (
            <li
              key={`${d.wallSlug}:${d.id}`}
              className="border border-ink/10 bg-surface p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3 text-xs uppercase tracking-[0.14em] text-ink-faint">
                <span>{wallTitles.get(d.wallSlug) ?? d.wallSlug}</span>
                <time dateTime={new Date(d.timestamp).toISOString()}>
                  {formatDateTime(d.timestamp)}
                </time>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <p className="font-display text-ink">
                  {d.anonymous
                    ? "Anonymous"
                    : d.name.trim() || "(no name)"}
                </p>
                <p className="text-eye-deep font-display">
                  {formatMoney(d.amountCents)}
                </p>
                <p className="text-xs italic text-ink-faint">
                  {d.showAmount ? "showing amount" : "amount hidden"}
                </p>
              </div>
              <p className="font-serif italic text-ink-muted leading-relaxed mb-4">
                &ldquo;{d.note}&rdquo;
              </p>
              <AdminDonationRow slug={d.wallSlug} id={d.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
