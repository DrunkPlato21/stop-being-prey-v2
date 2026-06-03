import fs from "fs";
import path from "path";
import matter from "gray-matter";
import Link from "next/link";
import type { Metadata } from "next";
import { listEarlyAccessSlugs, essayTitle, formatEssayDate } from "@/lib/early-access";

export const metadata: Metadata = {
  title: "Early access",
};

export const dynamic = "force-dynamic";

function metaForSlug(slug: string): { title: string; dateStr: string } {
  try {
    const file = fs.readFileSync(
      path.join(process.cwd(), "content", "early-access", `${slug}.md`),
      "utf8"
    );
    const { data } = matter(file);
    const d = data as Record<string, unknown>;
    return { title: essayTitle(d), dateStr: formatEssayDate(d.date) };
  } catch {
    return { title: slug, dateStr: "" };
  }
}

export default function EarlyAccessIndexPage() {
  const slugs = listEarlyAccessSlugs();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <h1
        className="font-display text-ink leading-tight tracking-tight mb-2"
        style={{
          fontSize: "clamp(1.6rem, 4vw, 2.3rem)",
          fontWeight: 700,
          letterSpacing: "-0.022em",
        }}
      >
        Early-access essays
      </h1>
      <p className="font-serif italic text-ink-muted mb-8">
        Member-only drops authored as markdown. Open one to edit it with a
        live preview.
      </p>

      {slugs.length === 0 ? (
        <p className="font-serif italic text-ink-faint">
          No essays in content/early-access yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {slugs.map((slug, i) => {
            const { title, dateStr } = metaForSlug(slug);
            return (
              <li
                key={slug}
                className={i === 0 ? "py-5" : "py-5 border-t border-rule"}
              >
                <Link
                  href={`/admin/early-access/${slug}`}
                  className="no-underline group"
                >
                  <p
                    className="font-display text-ink leading-tight mb-1 group-hover:text-eye-deep transition-colors"
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {title}
                  </p>
                  <p className="eyebrow">
                    {slug}.md{dateStr && <> · {dateStr}</>}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
