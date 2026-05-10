import Link from "next/link";
import { notFound } from "next/navigation";
import { getWallBySlug } from "@/lib/walls";
import { EyeDivider } from "@/components/Eyes";

type PageParams = { slug: string };

export const dynamic = "force-dynamic";

export default async function WallThanksPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { slug } = await params;
  const wall = await getWallBySlug(slug);
  if (!wall) notFound();

  return (
    <div>
      <section className="border-b border-rule">
        <div className="max-w-3xl mx-auto px-6 pt-24 md:pt-32 pb-16 text-center">
          <p className="eyebrow mb-6">Thank you</p>
          <h1
            className="font-display text-ink leading-[1.0] tracking-tight mb-6"
            style={{
              fontSize: "clamp(2.25rem, 5.5vw, 4rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            Your note is in the queue.
          </h1>
          <p className="deck max-w-xl mx-auto mb-8">
            Notes are reviewed before they appear on the wall. You&apos;ll
            see yours alongside the rest of the backers shortly.
          </p>
          <Link href={`/walls/${wall.slug}`} className="btn-primary">
            <span>Back to the wall</span>
          </Link>
        </div>
      </section>
      <EyeDivider />
    </div>
  );
}
