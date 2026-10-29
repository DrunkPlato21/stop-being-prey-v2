import { NextResponse } from "next/server";
import { getArchiveReader, getSearchCorpus } from "@/lib/email-archive";

// Full text of every archived email, fetched once by the /emails index
// the first time a patron types in its search box. Titles and previews
// already ship with the page, so the list filters instantly on those
// while this (a few hundred KB, gzipped) loads behind it.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const devPreview = new URL(req.url).searchParams.get("dev_preview");
  if (!(await getArchiveReader(devPreview))) {
    return NextResponse.json({ error: "patrons only" }, { status: 403 });
  }
  const corpus = await getSearchCorpus();
  return NextResponse.json(
    { emails: corpus },
    { headers: { "Cache-Control": "private, max-age=600" } }
  );
}
