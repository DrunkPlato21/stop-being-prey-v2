import { PatronageLanding } from "@/components/PatronageLanding";
import type { Metadata } from "next";

// The canonical patronage URL. /membership and /support-donate render
// the same component and point their canonical here. The page body lives
// in components/PatronageLanding.tsx — one source file, three routes.

export type PatronageSearchParams = {
  preview?: string;
  access?: string;
  src?: string;
};

export const metadata: Metadata = {
  title: "Patronage",
  description:
    "Back the writing. Set your own rate, monthly or annual, and keep me at the desk.",
  // Self-referencing canonical. This is the target the other two routes
  // point at, so it has to be indexable: no robots block here.
  alternates: {
    canonical: "/patronage",
  },
};

// Counters and the wall window render fresh per request.
export const dynamic = "force-dynamic";

export default async function PatronagePage({
  searchParams,
}: {
  searchParams?: Promise<PatronageSearchParams>;
}) {
  return <PatronageLanding searchParams={searchParams} />;
}
