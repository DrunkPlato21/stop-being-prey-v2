import { MemberNavServer } from "@/components/MemberNavServer";

// Layout for /lounge. Mirrors /desk and /case-files so the member
// sidebar is consistent across every member surface.

export default function LoungeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="md:flex md:max-w-6xl md:mx-auto md:gap-10 md:px-6">
      <MemberNavServer />
      <div className="md:flex-1 md:min-w-0">{children}</div>
    </div>
  );
}
