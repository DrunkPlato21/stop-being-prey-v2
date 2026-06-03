import Link from "next/link";
import type { Metadata } from "next";
import { AdminSignInLinkLookup } from "@/components/AdminSignInLinkLookup";

// Admin quick tool: mint a manual sign-in link for any member. For when
// a member's automated sign-in email isn't landing (corporate inbox
// filtering). Gated by proxy.ts via HTTP Basic auth on /admin/*; 404s in
// production, so it runs from localhost only.

export const metadata: Metadata = {
  title: "Sign-in links, admin",
  description: "Mint a manual sign-in link for a member.",
};

export const dynamic = "force-dynamic";

export default function AdminSignInLinksPage() {
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
    </div>
  );
}
