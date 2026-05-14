import { MemberNav } from "@/components/MemberNav";

// Layout for the authenticated member surface. The (member) route group
// scopes this layout to /notes, /notes/start, /notes/[slug], and
// /notes/account — but NOT /notes/sign-in, which lives outside the
// group and renders without the member nav.
//
// On md+: nav is a sticky 200px sidebar to the left of the content.
// On mobile: nav is a sticky horizontal strip above the content.
// Pages render their own max-width centering inside the right column.

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="md:flex md:max-w-6xl md:mx-auto md:gap-10 md:px-6">
      <MemberNav />
      <div className="md:flex-1 md:min-w-0">{children}</div>
    </div>
  );
}
