import Link from "next/link";
import { getEmailIndex } from "@/lib/email-archive";
import { getMarkStats, type ReadKeyspace } from "@/lib/email-reads";
import { getGiftCounts } from "@/lib/email-gifts";
import { emailHref, shortDate } from "@/app/emails/format";

// Admin: which archive emails patrons have read, most first, with how
// many have starred each and how many gift links each has had made.
// Counts only. Deliberately no per-patron view; who read, starred or
// shared what stays private to the patron.
//
// Reads the LIVE keyspace by default. /admin only runs on localhost,
// where the archive itself writes to dev:, so ?keyspace=dev is there for
// checking the page against local test marks.

export const metadata = {
  title: "Admin · Emails",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ keyspace?: string }>;
}) {
  const { keyspace: raw } = await searchParams;
  const keyspace: ReadKeyspace = raw === "dev" ? "dev" : "live";
  const [{ emails }, stats, favStats, gifts] = await Promise.all([
    getEmailIndex(),
    getMarkStats("read", keyspace),
    getMarkStats("fav", keyspace),
    getGiftCounts(keyspace),
  ]);

  if (!stats) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="italic text-ink-muted">
          Read counts need Redis (UPSTASH_REDIS_REST_URL / TOKEN missing).
        </p>
      </div>
    );
  }

  const rows = emails
    .map((e) => ({
      email: e,
      count: stats.counts.get(e.kitId) ?? 0,
      favs: favStats?.counts.get(e.kitId) ?? 0,
      gifts: gifts.get(e.kitId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.favs - a.favs ||
        b.gifts - a.gifts ||
        (a.email.sentAt < b.email.sentAt ? 1 : -1)
    );
  const max = rows[0]?.count ?? 0;
  const totalMarks = rows.reduce((sum, r) => sum + r.count, 0);
  const emailsRead = rows.filter((r) => r.count > 0).length;
  const totalGifts = rows.reduce((sum, r) => sum + r.gifts, 0);
  const anything = stats.patrons > 0 || totalGifts > 0 || (favStats?.patrons ?? 0) > 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-8">
        <p className="eyebrow mb-2">
          Admin · Emails
          {keyspace === "dev" && (
            <span className="ml-3 text-ink-faint">dev keyspace</span>
          )}
        </p>
        <h1
          className="font-display text-ink leading-tight tracking-tight mb-3"
          style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          Most read
        </h1>
        <p className="text-ink-muted" style={{ fontSize: "1rem" }}>
          How many patrons have each archive email marked read, starred, and
          shared as a gift link. Totals only.
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <Stat label="Patrons reading" value={stats.patrons} />
        <Stat label="Emails read" value={`${emailsRead} of ${emails.length}`} />
        <Stat label="Read marks" value={totalMarks} />
        <Stat label="Gift links" value={totalGifts} />
      </dl>

      {!anything ? (
        <p className="italic text-ink-muted">
          No patron has read, starred or shared an email yet.
        </p>
      ) : (
        <ol className="flex flex-col">
          <li
            className="grid gap-x-4 pb-2 text-xs uppercase tracking-[0.14em] text-ink-faint"
            style={{ gridTemplateColumns: "2.25rem 1fr 4.5rem 4.5rem 4.5rem" }}
            aria-hidden
          >
            <span />
            <span>Email</span>
            <span className="text-right">Read</span>
            <span className="text-right">Starred</span>
            <span className="text-right">Gifted</span>
          </li>
          {rows.map(({ email, count, favs, gifts: giftCount }, i) => (
            <li
              key={email.kitId}
              className="grid items-baseline gap-x-4 py-3 border-t border-rule"
              style={{ gridTemplateColumns: "2.25rem 1fr 4.5rem 4.5rem 4.5rem" }}
            >
              <span
                className="text-ink-faint text-sm"
                style={{ fontVariantNumeric: "lining-nums tabular-nums" }}
              >
                {count + favs + giftCount > 0 ? i + 1 : ""}
              </span>
              <span className="min-w-0">
                <Link
                  href={emailHref(email)}
                  className="font-display text-ink hover:text-eye-deep no-underline"
                  style={{ fontSize: "1.2rem", fontWeight: 600 }}
                >
                  {email.subject}
                </Link>
                <span className="block text-xs uppercase tracking-[0.14em] text-ink-faint mt-1">
                  {shortDate(email.sentAt)}
                  {email.essay && " · Essay"}
                </span>
                <span
                  aria-hidden
                  className="block mt-2 h-[3px] bg-rule"
                  style={{ maxWidth: "24rem" }}
                >
                  <span
                    className="block h-full bg-eye"
                    style={{ width: max ? `${(count / max) * 100}%` : 0 }}
                  />
                </span>
              </span>
              <span
                className="font-display text-ink text-right"
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  fontVariantNumeric: "lining-nums tabular-nums",
                }}
              >
                {count}
                <span className="block text-xs font-normal text-ink-faint">
                  {stats.patrons ? Math.round((count / stats.patrons) * 100) : 0}%
                </span>
              </span>
              <Num value={favs} label="patrons starred this" />
              <Num value={giftCount} label="gift links made" />
            </li>
          ))}
        </ol>
      )}

      <p className="mt-10 text-xs text-ink-faint">
        Read percentages are of the {stats.patrons} patron
        {stats.patrons === 1 ? "" : "s"} who have marked anything read. Gift
        links count each link made once, however often it was opened.{" "}
        <Link
          href={keyspace === "dev" ? "/admin/emails" : "/admin/emails?keyspace=dev"}
          className="underline"
        >
          {keyspace === "dev" ? "Show live counts" : "Show dev test counts"}
        </Link>
      </p>
    </div>
  );
}

function Num({ value, label }: { value: number; label: string }) {
  return (
    <span
      className={`font-display text-right ${value ? "text-ink" : "text-ink-faint"}`}
      style={{
        fontSize: "1.2rem",
        fontWeight: 600,
        fontVariantNumeric: "lining-nums tabular-nums",
      }}
      aria-label={`${value} ${label}`}
    >
      {value}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-ink/10 bg-surface px-4 py-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </dt>
      <dd
        className="font-display text-ink mt-1"
        style={{
          fontSize: "1.6rem",
          fontWeight: 700,
          fontVariantNumeric: "lining-nums",
        }}
      >
        {value}
      </dd>
    </div>
  );
}
