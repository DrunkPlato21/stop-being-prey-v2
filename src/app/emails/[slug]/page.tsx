import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import {
  getArchiveReader,
  getEmailBySlug,
  type EmailMeta,
} from "@/lib/email-archive";
import { getReadKitIds } from "@/lib/email-reads";
import { EyeDivider } from "@/components/Eyes";
import { PatronTeaser } from "../PatronTeaser";
import { emailHref, longDate, shortDate } from "../format";
import { EmailKeys } from "./EmailKeys";
import { ReadTracker } from "./ReadTracker";

type PageParams = { slug: string };

export const dynamic = "force-dynamic";

// How much of an email a non-patron sees above the offer: enough to
// hear the voice, not enough to have read it.
const TEASER_PARAGRAPHS = 3;

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await getEmailBySlug(slug);
  if (!found) return {};
  return {
    title: { absolute: `${found.email.subject} | Every Email | Stop Being Prey` },
    description: found.email.preview || undefined,
    robots: { index: false, follow: false },
  };
}

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<{ q?: string; dev_preview?: string }>;
}) {
  const [{ slug }, { q, dev_preview }] = await Promise.all([
    params,
    searchParams,
  ]);
  const [found, reader] = await Promise.all([
    getEmailBySlug(slug),
    getArchiveReader(dev_preview),
  ]);
  if (!found) notFound();
  const { email, older, newer, total } = found;

  // An email that carried a published essay has no copy here: the essay
  // page is the one version, and it's public anyway.
  if (email.essay) permanentRedirect(`/${email.essay.slug}`);

  // Back to the index lands on the search the reader came from.
  const backHref = q ? `/emails?q=${encodeURIComponent(q)}` : "/emails";

  if (!reader) {
    const session = await verifySession(
      (await cookies()).get(SESSION_COOKIE)?.value
    );
    const opening = email.html
      .split(/(?<=<\/(?:p|blockquote|ul|h2|h3)>)/)
      .slice(0, TEASER_PARAGRAPHS)
      .join("");
    return (
      <article className="relative">
        <EmailHeader email={email} total={total} />
        <div className="max-w-3xl mx-auto px-6 pt-10 md:pt-14">
          <div className="ar-teaser-fade">
            <div
              className="prose-article"
              dangerouslySetInnerHTML={{ __html: opening }}
            />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-6 pb-20">
          <PatronTeaser
            total={total}
            signedIn={!!session}
            next={`/emails/${email.slug}`}
          />
        </div>
      </article>
    );
  }

  const readIds = await getReadKitIds(reader.email);

  return (
    <article className="relative">
      <EmailKeys
        olderHref={older ? emailHref(older) : null}
        newerHref={newer ? emailHref(newer) : null}
      />
      <div className="max-w-3xl mx-auto px-6 pt-6">
        <Link href={backHref} className="ar-back">
          <span aria-hidden>←</span> {q ? "Back to results" : "All emails"}
        </Link>
      </div>
      <EmailHeader email={email} total={total} />

      <div className="max-w-3xl mx-auto px-6 pt-10 md:pt-14 pb-6">
        <ReadTracker
          kitId={email.kitId}
          initiallyRead={readIds.includes(email.kitId)}
        >
          <div
            className="prose-article ar-body"
            dangerouslySetInnerHTML={{ __html: email.html }}
          />
        </ReadTracker>
      </div>

      <EyeDivider />

      <nav className="ar-pager max-w-3xl mx-auto px-6 pb-16" aria-label="More emails">
        {older ? (
          <PagerLink email={older} dir="older" />
        ) : (
          <span className="ar-pager-end">This is the first one.</span>
        )}
        {newer ? (
          <PagerLink email={newer} dir="newer" />
        ) : (
          <span className="ar-pager-end ar-pager-end-right">This is the latest.</span>
        )}
      </nav>
    </article>
  );
}

function EmailHeader({ email, total }: { email: EmailMeta; total: number }) {
  return (
    <header className="border-b border-rule">
      <div className="max-w-4xl mx-auto px-6 pt-10 md:pt-16 pb-10 md:pb-12 text-center">
        <p
          className="eyebrow mb-6 fade-up stagger-1"
          style={{ fontVariantNumeric: "lining-nums" }}
        >
          Email {email.number} of {total}
        </p>
        <h1
          className="font-display text-ink leading-[1.02] tracking-tight mb-6 fade-up stagger-2"
          style={{
            fontSize: "clamp(2.3rem, 6vw, 4.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {email.subject}
        </h1>
        {email.preview && (
          <p className="deck max-w-2xl mx-auto mb-8 fade-up stagger-3">
            {email.preview}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-ink-faint fade-up stagger-4 uppercase tracking-[0.15em]">
          <time dateTime={email.sentAt}>{longDate(email.sentAt)}</time>
          <span className="text-rule">·</span>
          <span>{email.readMin} min read</span>
        </div>
      </div>
    </header>
  );
}

function PagerLink({ email, dir }: { email: EmailMeta; dir: "older" | "newer" }) {
  return (
    <Link
      href={emailHref(email)}
      className={`ar-pager-link ${dir === "newer" ? "ar-pager-newer" : ""}`}
      rel={dir === "older" ? "prev" : "next"}
    >
      <span className="ar-pager-dir">
        {dir === "older" ? "← Older" : "Newer →"}
        {email.essay && <span className="ar-essay-tag">Essay</span>}
      </span>
      <span className="ar-pager-title">{email.subject}</span>
      <span className="ar-pager-date">{shortDate(email.sentAt)}</span>
    </Link>
  );
}
