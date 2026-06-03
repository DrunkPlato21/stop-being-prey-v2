import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { readEssayRaw } from "@/lib/early-access";
import { EarlyAccessEditor } from "@/components/EarlyAccessEditor";

export const metadata: Metadata = {
  title: "Early access, edit",
};

export const dynamic = "force-dynamic";

export default async function EarlyAccessEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const raw = readEssayRaw(slug);
  if (raw === null) notFound();

  return (
    <div className="max-w-[110rem] mx-auto px-6 py-8 md:py-10">
      <p className="eyebrow mb-3">
        <Link
          href="/admin/early-access"
          className="text-ink-muted hover:text-eye-deep no-underline"
        >
          ← all early-access essays
        </Link>
      </p>

      <h1
        className="font-display text-ink leading-tight tracking-tight mb-2"
        style={{
          fontSize: "clamp(1.5rem, 3.5vw, 2.1rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Editing <code className="text-eye-deep">{slug}.md</code>
      </h1>

      <p className="font-serif italic text-ink-muted mb-6">
        Edit on the left, watch the real page render on the right. Save
        writes the file on this machine. Commit and deploy to publish.
        Plain prose is always safe; only the frontmatter and the{" "}
        <code>{"{{tokens}}"}</code> can be flagged.
      </p>

      <EarlyAccessEditor slug={slug} initialRaw={raw} />
    </div>
  );
}
