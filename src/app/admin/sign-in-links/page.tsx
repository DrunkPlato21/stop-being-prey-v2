import Link from "next/link";
import type { Metadata } from "next";
import { AdminSignInLinkLookup } from "@/components/AdminSignInLinkLookup";
import { getSectionSeen, markSectionSeen } from "@/lib/admin-nav-badges";
import {
  lastSignedInByEmail,
  listSignInFailures,
  type SignInFailureKind,
} from "@/lib/signin-failures";

// Admin quick tool: mint a manual sign-in link for any member, and read
// every recent failure to get in (lib/signin-failures). Gated by proxy.ts
// via HTTP Basic auth on /admin/*; 404s in production, so it runs from
// localhost only.

export const metadata: Metadata = {
  title: "Sign-in links, admin",
  description: "Mint a manual sign-in link for a member.",
};

export const dynamic = "force-dynamic";

// What each failure means, and the move that fixes it.
const KINDS: Record<SignInFailureKind, { label: string; fix: string }> = {
  link_used: {
    label: "Link already used",
    fix: "Something opened it first, or they clicked an old one. Mint a fresh link.",
  },
  link_expired: {
    label: "Link expired",
    fix: "Clicked too late. Mint a fresh link.",
  },
  link_unknown: {
    label: "Unknown link",
    fix: "A mangled link or one sent before tracking began. No name to act on.",
  },
  no_account: {
    label: "Email not on file",
    fix: "Likely a typo or a second address. Find the real member and reply.",
  },
  rate_limited: {
    label: "Asked too many times",
    fix: "Repeated requests usually mean the mail isn't arriving. Check below for a delivery problem.",
  },
  send_failed: {
    label: "Send refused",
    fix: "Resend rejected the sign-in email. Check the Resend dashboard.",
  },
  undeliverable: {
    label: "Mail not delivered",
    fix: "Bounced, suppressed, or marked as spam. A typo needs the email changed; a suppression needs lifting in Resend.",
  },
  auth_unavailable: {
    label: "Sign-in service error",
    fix: "Server-side fault. Check Vercel logs.",
  },
};

const DAY = 24 * 60 * 60 * 1000;

function when(at: number): string {
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export default async function AdminSignInLinksPage() {
  const seenBefore = await getSectionSeen("sign-ins");
  const failures = await listSignInFailures(200);
  await markSectionSeen("sign-ins");
  const seenAt = await lastSignedInByEmail();
  // Same name before the @: how a typo'd address ("gmail.comn") gets
  // matched to the member who got in right after correcting it.
  const seenByLocal = new Map<string, number>();
  for (const [email, t] of seenAt) {
    const local = email.split("@")[0];
    seenByLocal.set(local, Math.max(t, seenByLocal.get(local) ?? 0));
  }
  // Got in after this failure = resolved. Undeliverable mail is the
  // exception: signing in on an old session doesn't fix a dead inbox.
  const gotInAfter = (f: (typeof failures)[number]): number | null => {
    if (!f.email || f.kind === "undeliverable") return null;
    const email = f.email.toLowerCase();
    const t =
      seenAt.get(email) ??
      (f.kind === "no_account" ? seenByLocal.get(email.split("@")[0]) : undefined);
    return t && t > f.at ? t : null;
  };

  const recent = failures.filter(
    (f) => !f.dev && Date.now() - f.at < 30 * DAY && !gotInAfter(f)
  );
  const resolvedCount = failures.filter(
    (f) => !f.dev && Date.now() - f.at < 30 * DAY && gotInAfter(f)
  ).length;
  const counts = new Map<SignInFailureKind, number>();
  for (const f of recent) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);

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
          Sign-in links.
        </h1>
        <Link
          href="/admin/desk"
          className="font-display uppercase tracking-[0.22em] text-eye-deep hover:text-ink no-underline transition-colors"
          style={{ fontSize: "0.7rem", fontWeight: 600 }}
        >
          back to desk &rarr;
        </Link>
      </div>

      <p className="font-serif italic text-ink-muted mb-8 leading-relaxed">
        For a member whose automated sign-in email isn&apos;t landing
        (often corporate inbox filtering). Enter their email to mint a
        single-use sign-in link, then paste it into a personal email to
        them. Only works for an email already on file as a member.
      </p>

      <AdminSignInLinkLookup />

      <section className="mt-16">
        <h2
          className="font-display text-ink tracking-tight mb-2"
          style={{ fontSize: "1.5rem", fontWeight: 700 }}
        >
          Who couldn&apos;t get in.
        </h2>
        <p className="font-serif italic text-ink-muted mb-6 leading-relaxed">
          Every failed attempt, logged as it happens. Undelivered mail is
          checked against Resend once a day.
        </p>

        {(recent.length > 0 || resolvedCount > 0) && (
          <p className="text-sm text-ink-muted mb-6">
            Last 30 days, still unresolved:{" "}
            {recent.length === 0
              ? "none"
              : [...counts.entries()]
                  .map(([kind, n]) => `${KINDS[kind].label.toLowerCase()} ${n}`)
                  .join(" · ")}
            {resolvedCount > 0 && `. Resolved on their own: ${resolvedCount}.`}
          </p>
        )}

        {failures.length === 0 ? (
          <p className="font-serif italic text-ink-muted">
            Nothing yet. Failures show up here the moment they happen.
          </p>
        ) : (
          <ul className="border-t border-rule">
            {failures.map((f) => {
              const kind = KINDS[f.kind];
              const isNew = f.at > seenBefore;
              const resolvedAt = gotInAfter(f);
              return (
                <li
                  key={f.id}
                  className="border-b border-rule py-4"
                  style={resolvedAt ? { opacity: 0.5 } : undefined}
                >
                  <div className="flex items-baseline justify-between gap-4 flex-wrap">
                    <span className="font-display text-ink" style={{ fontWeight: 600 }}>
                      {kind.label}
                      {isNew && (
                        <span
                          className="ml-2 font-display uppercase tracking-[0.18em] text-eye-deep"
                          style={{ fontSize: "0.65rem" }}
                        >
                          new
                        </span>
                      )}
                      {f.dev && (
                        <span
                          className="ml-2 font-display uppercase tracking-[0.18em] text-ink-faint"
                          style={{ fontSize: "0.65rem" }}
                        >
                          local test
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-ink-muted">{when(f.at)}</span>
                  </div>
                  <div className="font-serif text-ink mt-1 break-all">
                    {f.email ?? <span className="italic text-ink-muted">no email known</span>}
                  </div>
                  {f.detail && (
                    <div className="text-sm text-ink-muted mt-1">{f.detail}</div>
                  )}
                  {resolvedAt ? (
                    <div className="text-sm italic text-eye-deep mt-1">
                      Got in {when(resolvedAt)}. Nothing to do.
                    </div>
                  ) : (
                    <div className="text-sm italic text-ink-muted mt-1">{kind.fix}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
