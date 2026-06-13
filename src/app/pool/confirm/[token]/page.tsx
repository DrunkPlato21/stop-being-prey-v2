import type { Metadata } from "next";
import { PoolConfirm } from "@/components/PoolConfirm";

// Confirm landing for a pool claim. The token in the URL is the link we
// emailed; loading this page (and the auto-POST inside PoolConfirm) is
// the confirmation that takes a seat or holds a place in line. Readable
// signed-out. COPY IS DRAFT — Clay finalizes.

export const metadata: Metadata = {
  title: "Confirm your seat",
  description: "Confirm your request for a seat inside Stop Being Prey.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PoolConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-14 text-center">
          <p className="eyebrow mb-6 fade-up stagger-1">Almost in</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-8 fade-up stagger-2"
            style={{
              fontSize: "clamp(2.5rem, 5.5vw, 4.25rem)",
              fontWeight: 700,
              letterSpacing: "-0.025em",
            }}
          >
            Taking your seat.
          </h1>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
        <PoolConfirm token={token} />
      </section>
    </div>
  );
}
