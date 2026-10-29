import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getArchiveReader, getEmailIndex } from "@/lib/email-archive";
import { getReadKitIds } from "@/lib/email-reads";
import { EmailArchive } from "./EmailArchive";
import { PatronTeaser } from "./PatronTeaser";
import { shortDate } from "./format";

export const metadata: Metadata = {
  title: "Every Email",
  description: "Every email Clay has ever sent, for patrons.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EmailsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ dev_preview?: string }>;
}) {
  const { dev_preview } = await searchParams;
  const [reader, { emails, startHere }] = await Promise.all([
    getArchiveReader(dev_preview),
    getEmailIndex(),
  ]);

  if (!reader) {
    const session = await verifySession(
      (await cookies()).get(SESSION_COOKIE)?.value
    );
    return (
      <div>
        <Masthead
          deck={`Every email I've sent, from the first one to the latest. ${emails.length} so far.`}
        />
        <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
          <PatronTeaser
            total={emails.length}
            signedIn={!!session}
            next="/emails"
          />
          {startHere.length > 0 && (
            <div className="mt-16">
              <p className="ar-section-label">
                <span>Where patrons start</span>
              </p>
              <ul className="ar-teaser-list">
                {startHere.map((e) => (
                  <li key={e.slug}>
                    <span className="ar-teaser-title">{e.subject}</span>
                    <span className="ar-teaser-date">{shortDate(e.sentAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div>
      <Masthead
        deck={`${emails.length} emails, newest first. Search for any word${
          startHere.length > 0 ? ", or begin with the picks below" : ""
        }.`}
      />
      <EmailArchive
        emails={emails}
        startHere={startHere}
        initialRead={await getReadKitIds(reader.email)}
      />
    </div>
  );
}

function Masthead({ deck }: { deck: string }) {
  return (
    <section className="border-b border-rule">
      <div className="max-w-4xl mx-auto px-6 pt-14 md:pt-20 pb-10 md:pb-12 text-center">
        <p className="eyebrow mb-6 fade-up stagger-1">The patron archive</p>
        <h1
          className="font-display text-ink leading-[1.0] tracking-tight mb-6 fade-up stagger-2"
          style={{
            fontSize: "clamp(2.5rem, 5.5vw, 4.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
          }}
        >
          Every email.
        </h1>
        <p className="deck max-w-xl mx-auto fade-up stagger-3">{deck}</p>
      </div>
    </section>
  );
}
