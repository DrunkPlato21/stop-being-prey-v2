import { PatronageLanding } from "@/components/PatronageLanding";
import type { PatronageSearchParams } from "@/app/patronage/page";
import type { Metadata } from "next";

// /membership now renders the patronage page. Not a redirect: this URL is
// linked from the nav, old essays, Kit sends, the gift + pool emails and
// every share of the page to date, and it stays a real 200 for all of
// them. The canonical below points at /patronage so the two URLs are
// never treated as competing pages.
//
// The page body is components/PatronageLanding.tsx, shared with
// /patronage and /support-donate. The older access-framed membership
// page that used to live here is in git history.
//
// The CHILDREN of this route are deliberately untouched: /membership/gift,
// /pool, /account, /success, /cover and /gift/success are separate files
// and still render exactly as before.

export const metadata: Metadata = {
  title: "Patronage",
  description:
    "Back the writing. Set your own rate, monthly or annual, and keep me at the desk.",
  alternates: {
    canonical: "/patronage",
  },
};

export const dynamic = "force-dynamic";

export default async function MembershipPage({
  searchParams,
}: {
  searchParams?: Promise<PatronageSearchParams>;
}) {
  return <PatronageLanding searchParams={searchParams} />;
}
