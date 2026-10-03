import { notFound } from "next/navigation";
import { FOUNDING_OFFLINE } from "@/lib/founding";

export default function FoundingLayout({ children }: { children: React.ReactNode }) {
  if (FOUNDING_OFFLINE) notFound();
  return children;
}
