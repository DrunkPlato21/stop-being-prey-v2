import fs from "fs";
import path from "path";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isPaidViewer } from "@/lib/viewer";
import { getAllArticles } from "@/lib/articles";
import {
  fetchKitBroadcasts,
  htmlToText,
  isArchivable,
  toArchivedEmail,
  type ArchivedEmail,
} from "@/lib/email-archive-core";

// The patron email archive (/emails): every email Clay has sent to the
// whole list, readable on the site.
//
// Two sources, merged:
//   1. content/emails/archive.json, a snapshot written by
//      scripts/sync-email-archive.mts. The bulk of the archive, bundled
//      with the deploy, so the pages never wait on Kit for it.
//   2. Kit itself, asked at request time for anything the snapshot
//      doesn't have yet (one page of the newest 50 broadcasts, cached 15
//      minutes). This is what makes a new email appear without a deploy.
//      If Kit is down or the key is missing, it quietly adds nothing.
//
// content/emails/curation.json holds the editorial knobs: the "Start
// here" picks, a hide list, and the emails that carried a published
// essay. Those aren't given a reading page of their own (it would be a
// second, worse copy of the essay); the archive lists them as an Essay
// and links to the essay itself.

const DIR = path.join(process.cwd(), "content", "emails");
const WORDS_PER_MINUTE = 230;
const LIVE_REVALIDATE_SECONDS = 900;

export type EmailMeta = {
  slug: string;
  kitId: number;
  subject: string;
  preview: string;
  sentAt: string;
  readMin: number;
  /** 1 for the first email ever sent, counting up. */
  number: number;
  /** Set when this email carried a published essay: read it there. */
  essay: { slug: string; title: string } | null;
};


export type Email = EmailMeta & { html: string; text: string };

type Curation = {
  startHere: string[];
  hide: (string | number)[];
  /** Lowercased email subject -> essay slug. */
  essays: Record<string, string>;
};

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function readSnapshot(): ArchivedEmail[] {
  return readJson<ArchivedEmail[]>("archive.json", []);
}

function readCuration(): Curation {
  const raw = readJson<Partial<Curation>>("curation.json", {});
  const essays: Record<string, string> = {};
  if (raw.essays && typeof raw.essays === "object") {
    for (const [subject, slug] of Object.entries(raw.essays)) {
      if (typeof slug === "string") essays[subject.trim().toLowerCase()] = slug;
    }
  }
  return {
    startHere: Array.isArray(raw.startHere) ? raw.startHere : [],
    hide: Array.isArray(raw.hide) ? raw.hide : [],
    essays,
  };
}

// Keyed on the snapshot's newest id, so a deploy carrying a fresher
// snapshot starts a fresh cache entry instead of serving the old tail.
const fetchUnsnapshotted = unstable_cache(
  async (_snapshotNewestId: number) => {
    const apiKey = process.env.KIT_API_KEY;
    if (!apiKey) return [] as ArchivedEmail[];
    try {
      // Matched by id rather than "newer than": an email drafted before
      // the last snapshot but sent after it has an older id.
      const known = new Set(readSnapshot().map((e) => e.kitId));
      const broadcasts = await fetchKitBroadcasts({
        apiKey,
        perPage: 50,
        maxPages: 1,
        fetchInit: { cache: "no-store" },
      });
      return broadcasts
        .filter((b) => !known.has(b.id) && isArchivable(b))
        .map(toArchivedEmail);
    } catch (err) {
      console.error("[email-archive] Kit fetch failed", err);
      return [] as ArchivedEmail[];
    }
  },
  ["email-archive-live"],
  { revalidate: LIVE_REVALIDATE_SECONDS, tags: ["email-archive"] }
);

function slugify(subject: string): string {
  return subject
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function isHidden(e: ArchivedEmail, curation: Curation): boolean {
  const subject = e.subject.toLowerCase();
  return curation.hide.some((h) =>
    typeof h === "number" ? h === e.kitId : h.trim().toLowerCase() === subject
  );
}

type Archive = {
  /** Newest first. */
  emails: Email[];
  bySlug: Map<string, number>;
  startHere: EmailMeta[];
};

// Per-request memo: the index, an email page, and the search route each
// build the archive once no matter how many helpers they call.
const loadArchive = cache(async (): Promise<Archive> => {
  const snapshot = readSnapshot();
  const curation = readCuration();
  const newestId = snapshot.reduce((max, e) => Math.max(max, e.kitId), 0);
  const live = await fetchUnsnapshotted(newestId);

  const oldestFirst = [...live, ...snapshot]
    .filter((e) => !isHidden(e, curation))
    .sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1));

  // Only published essays count: a mapping to a draft (or a typo) falls
  // back to the email's own reading page rather than a dead link.
  const published = new Map(getAllArticles().map((a) => [a.slug, a.title]));
  const essayFor = (subject: string) => {
    const slug = curation.essays[subject.toLowerCase()];
    const title = slug ? published.get(slug) : undefined;
    return slug && title ? { slug, title } : null;
  };

  // Slugs are assigned oldest first, so when two emails share a subject
  // the earlier one keeps the clean URL and the later one gets its date.
  const taken = new Set<string>();
  const built: Email[] = oldestFirst.map((e, i) => {
    let slug = slugify(e.subject) || `email-${e.kitId}`;
    if (taken.has(slug)) slug = `${slug}-${e.sentAt.slice(0, 10)}`;
    if (taken.has(slug)) slug = `${slug}-${e.kitId}`;
    taken.add(slug);
    const text = htmlToText(e.html);
    const words = text ? text.split(/\s+/).length : 0;
    return {
      slug,
      kitId: e.kitId,
      subject: e.subject,
      preview: e.preview,
      sentAt: e.sentAt,
      readMin: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
      number: i + 1,
      essay: essayFor(e.subject),
      html: e.html,
      text,
    };
  });

  const emails = built.reverse();
  const bySlug = new Map(emails.map((e, i) => [e.slug, i]));

  const startHere: EmailMeta[] = [];
  for (const pick of curation.startHere) {
    const want = pick.trim().toLowerCase();
    const hit = emails.find((e) => e.subject.toLowerCase() === want);
    if (hit && !startHere.includes(hit)) startHere.push(toMeta(hit));
  }

  return { emails, bySlug, startHere };
});

function toMeta(e: Email): EmailMeta {
  return {
    slug: e.slug,
    kitId: e.kitId,
    subject: e.subject,
    preview: e.preview,
    sentAt: e.sentAt,
    readMin: e.readMin,
    number: e.number,
    essay: e.essay,
  };
}

export async function getEmailIndex(): Promise<{
  emails: EmailMeta[];
  startHere: EmailMeta[];
}> {
  const { emails, startHere } = await loadArchive();
  return { emails: emails.map(toMeta), startHere };
}

export async function getEmailBySlug(slug: string): Promise<{
  email: Email;
  /** The email sent just before this one. */
  older: EmailMeta | null;
  newer: EmailMeta | null;
  total: number;
} | null> {
  const { emails, bySlug } = await loadArchive();
  const i = bySlug.get(slug);
  if (i === undefined) return null;
  return {
    email: emails[i],
    older: emails[i + 1] ? toMeta(emails[i + 1]) : null,
    newer: i > 0 ? toMeta(emails[i - 1]) : null,
    total: emails.length,
  };
}

/** Plain text of every email, for the index page's full-text search. */
export async function getSearchCorpus(): Promise<
  { slug: string; text: string }[]
> {
  const { emails } = await loadArchive();
  return emails.map((e) => ({ slug: e.slug, text: e.text }));
}

/**
 * Who is reading the archive: the member email of a patron (or the
 * author), via the same session + live-seat check isPaidViewer() makes,
 * or null for anyone else. In dev only, `?dev_preview=1` opens it for
 * visual testing without a session, reading as a stand-in address in the
 * dev keyspace; the same escape hatch proxy.ts gives /notes. No effect in
 * production.
 */
export async function getArchiveReader(
  devPreview?: string | null
): Promise<{ email: string } | null> {
  const session = await verifySession(
    (await cookies()).get(SESSION_COOKIE)?.value
  );
  if (session?.email && (await isPaidViewer())) {
    return { email: session.email };
  }
  if (process.env.NODE_ENV !== "production" && devPreview === "1") {
    return { email: "dev-preview@localhost" };
  }
  return null;
}
