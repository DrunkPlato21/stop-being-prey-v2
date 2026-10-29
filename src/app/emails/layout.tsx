import { MemberNavServer } from "@/components/MemberNavServer";
import { isPaidViewer } from "@/lib/viewer";
import "./emails.css";

// Layout for /emails. Patrons get the member sidebar, same as every
// other member surface. Everyone else is looking at the teaser, where a
// nav full of rooms they can't open would just be clutter.

export default async function EmailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isPaidViewer())) return <>{children}</>;
  return (
    <div className="md:flex md:max-w-6xl md:mx-auto md:gap-10 md:px-6">
      <MemberNavServer />
      <div className="md:flex-1 md:min-w-0">{children}</div>
    </div>
  );
}
