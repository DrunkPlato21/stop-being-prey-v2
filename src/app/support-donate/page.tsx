import { PatronageLanding } from "@/components/PatronageLanding";
import type { PatronageSearchParams } from "@/app/patronage/page";
import type { Metadata } from "next";

// /support-donate is the URL sitting in Clay's email footer and in every
// send that has already gone out. It renders the patronage page rather
// than redirecting, so those links land on a real 200, and it declares
// /patronage as its canonical so it never competes in search.
//
// Deliberately NOT added to the sitemap: it exists to catch inbound
// traffic from mail that is already in the wild, not to be discovered.
//
// Page body: components/PatronageLanding.tsx, shared with /patronage and
// /membership.

export const metadata: Metadata = {
  title: "Patronage",
  description:
    "Back the writing. Set your own rate, monthly or annual, and keep me at the desk.",
  alternates: {
    canonical: "/patronage",
  },
};

export const dynamic = "force-dynamic";

export default async function SupportDonatePage({
  searchParams,
}: {
  searchParams?: Promise<PatronageSearchParams>;
}) {
  return <PatronageLanding searchParams={searchParams} />;
}
