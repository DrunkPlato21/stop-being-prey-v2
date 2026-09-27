import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

// Landing for an emailed sign-in link. The link itself no longer spends
// the token (mail scanners open links before members do; see
// api/auth/callback). This button is the one use.

export default async function ContinueSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) {
    redirect("/notes/sign-in?error=missing_token");
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
          One more tap.
        </h1>
        <p className="deck mb-10 max-w-md mx-auto">
          Your link checks out. Tap below to finish signing in.
        </p>

        <form method="POST" action="/api/auth/callback">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="bg-ink text-paper hover:bg-eye-deep px-10 py-4 font-display transition-colors text-sm uppercase tracking-widest"
          >
            Sign in
          </button>
        </form>
      </section>
    </div>
  );
}
