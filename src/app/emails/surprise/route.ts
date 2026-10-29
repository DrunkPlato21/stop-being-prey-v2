import { getArchiveReader, getEmailIndex } from "@/lib/email-archive";
import { getMarkedKitIds } from "@/lib/email-reads";

// GET /emails/surprise[?from=<kitId>]
// Sends a patron to a random email they haven't read yet ("Surprise
// me" on the index, "Or one you haven't read" under each email). Essays
// are left out: they open on their own pages, where reading them never
// marks the email read, so they'd keep coming up. Once everything's
// read it picks any email and says so (?surprise=all). `from` keeps it
// from landing on the email you're already on.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dev = url.searchParams.get("dev_preview");
  const back = (path: string) => {
    const to = new URL(path, url.origin);
    if (dev) to.searchParams.set("dev_preview", dev);
    return Response.redirect(to, 303);
  };

  const reader = await getArchiveReader(dev);
  if (!reader) return back("/emails");

  const from = Number(url.searchParams.get("from"));
  const [{ emails }, readIds] = await Promise.all([
    getEmailIndex(),
    getMarkedKitIds("read", reader.email),
  ]);
  const read = new Set(readIds);
  const pool = emails.filter((e) => !e.essay && e.kitId !== from);
  const unread = pool.filter((e) => !read.has(e.kitId));
  const pickFrom = unread.length > 0 ? unread : pool;
  if (pickFrom.length === 0) return back("/emails");

  const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  const to = new URL(`/emails/${pick.slug}`, url.origin);
  if (unread.length === 0) to.searchParams.set("surprise", "all");
  if (dev) to.searchParams.set("dev_preview", dev);
  return Response.redirect(to, 303);
}
