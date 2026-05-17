import { MemberNavServer } from "@/components/MemberNavServer";

// Layout for the member landing at /desk. Mirrors notes/(member)/layout
// — same sidebar nav vocabulary so the URL move doesn't introduce a
// different chrome for the same area.

export default function DeskLayout({
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
