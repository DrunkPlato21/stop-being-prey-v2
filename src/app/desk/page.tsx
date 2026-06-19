import type { Metadata } from "next";
import { WritersDesk } from "@/components/WritersDesk";

export const metadata: Metadata = {
  title: "The Writer's Desk",
  description: "Your members-area home base.",
};

export const dynamic = "force-dynamic";

// Member landing. Page is the widget — nothing above it, nothing below
// it. The widget carries its own WRITER'S DESK header, so the page omits
// the H1. The first-visit welcome is now the "Getting started" panel
// inside the widget (WritersDeskView), not a modal.

export default function DeskPage() {
  return (
    <div>
      <section className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <WritersDesk />
      </section>
    </div>
  );
}
