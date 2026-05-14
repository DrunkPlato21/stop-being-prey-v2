import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import { SESSION_COOKIE, safeNextPath, verifySession } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Field Notes archive.",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: "the link was missing its token. request a new one.",
  invalid_or_expired:
    "that link expired or has already been used. request a new one.",
  auth_unavailable:
    "the auth service isn't reachable right now. try again in a moment.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const errorReason =
    typeof params.error === "string" ? params.error : undefined;
  const errorMessage = errorReason ? ERROR_MESSAGES[errorReason] : undefined;

  // Already signed in? Skip the form entirely and land in the
  // dashboard (or the requested `next` path, validated). Saves a
  // wasted magic-link round-trip for someone who's already there.
  const cookieStore = await cookies();
  const session = await verifySession(
    cookieStore.get(SESSION_COOKIE)?.value
  );
  if (session) {
    redirect(safeNextPath(next));
  }

  return (
    <div>
      <section className="max-w-2xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
        <p className="eyebrow mb-6">Members area</p>
        <h1
          className="font-display text-ink leading-[1.05] tracking-tight mb-6"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 700,
            letterSpacing: "-0.022em",
          }}
        >
          Sign in.
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">
          Enter the email tied to your membership. We&apos;ll send a
          one-time sign-in link.
        </p>

        <SignInForm next={next} />

        {errorMessage && (
          <p
            className="mt-6 font-serif italic text-sm"
            style={{ color: "#7a3a2e" }}
          >
            {errorMessage}
          </p>
        )}

        <p className="mt-12 text-sm italic text-ink-muted leading-relaxed max-w-md mx-auto">
          Not a member yet?{" "}
          <Link
            href="/membership"
            className="text-eye-deep hover:text-ink"
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--eye)",
              textDecorationThickness: "1px",
              textUnderlineOffset: "3px",
            }}
          >
            See what&apos;s inside.
          </Link>
        </p>
      </section>
    </div>
  );
}
