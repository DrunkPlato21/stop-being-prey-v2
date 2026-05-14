import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  listForMember,
  markAllRead,
  type Notification,
} from "@/lib/notifications";

export const metadata: Metadata = {
  title: "Notifications",
};

export const dynamic = "force-dynamic";

// Full notification history for the signed-in member. V1 stub:
// shows up to 50 most recent. Pagination via ?before= cursor for
// future load-more. Opens the page already in "read" state — every
// unread notification is flipped on view, since the user is here to
// catch up.

const PAGE_SIZE = 50;

function relativeAgo(ms: number, now: number): string {
  const diff = Math.max(0, now - ms);
  const hr = Math.floor(diff / (60 * 60 * 1000));
  if (hr < 1) {
    const min = Math.max(1, Math.floor(diff / (60 * 1000)));
    return `${min}m ago`;
  }
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function NotificationRow({
  n,
  now,
}: {
  n: Notification;
  now: number;
}) {
  const isInternal = n.linkUrl.startsWith("/");
  const className =
    "block px-5 py-4 no-underline transition-colors hover:bg-paper-deep";
  const inner = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p
          className="font-display text-ink leading-snug"
          style={{
            fontSize: "1.02rem",
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          {n.title}
        </p>
        {n.body && (
          <p
            className="font-serif text-ink-muted mt-1.5 leading-relaxed"
            style={{ fontSize: "0.92rem" }}
          >
            {n.body}
          </p>
        )}
      </div>
      <span
        className="font-serif italic text-ink-faint shrink-0"
        style={{ fontSize: "0.78rem", marginTop: "0.1rem" }}
      >
        {relativeAgo(n.createdAt, now)}
      </span>
    </div>
  );
  if (isInternal) {
    return (
      <Link href={n.linkUrl} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={n.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {inner}
    </a>
  );
}

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/notes/sign-in?next=/notifications");
  }

  // Member is here to catch up — mark everything read before render.
  await markAllRead(session.email);
  const items = await listForMember(session.email, { limit: PAGE_SIZE });
  const now = Date.now();

  return (
    <div className="rules-paper">
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-10 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Member</p>
          <h1
            className="font-display text-ink leading-[1.05] tracking-tight mb-4 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.25rem, 4.5vw, 3.4rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Notifications.
          </h1>
          <p className="deck max-w-xl mx-auto fade-up stagger-3">
            Everything Clay&apos;s done that touched your work.
          </p>
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-6">
          <Link
            href="/desk"
            className="font-display uppercase tracking-[0.22em] text-ink-faint hover:text-ink no-underline transition-colors"
            style={{ fontSize: "0.62rem", fontWeight: 600 }}
          >
            &larr; Back to the desk
          </Link>
        </div>

        {items.length === 0 ? (
          <p
            className="font-serif italic text-ink-muted leading-relaxed"
            style={{ fontSize: "1rem" }}
          >
            No notifications yet. When Clay engages with your work,
            you&apos;ll see it here.
          </p>
        ) : (
          <div
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
            }}
          >
            <ul className="flex flex-col">
              {items.map((n, idx) => (
                <li
                  key={n.id}
                  style={{
                    borderTop:
                      idx === 0 ? "0" : "1px solid var(--rule)",
                  }}
                >
                  <NotificationRow n={n} now={now} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <p
          className="font-serif italic text-ink-faint mt-6 leading-relaxed"
          style={{ fontSize: "0.82rem" }}
        >
          Unread notifications are kept for 60 days; once you&apos;ve
          read them, they stick around for another 14. Beyond that
          they age out automatically.
        </p>
      </section>
    </div>
  );
}
