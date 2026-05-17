import { MemberNavServer } from "@/components/MemberNavServer";

// Layout for /case-files. Mirrors /desk and /notes/(member) so the
// member sidebar is consistent across all four member surfaces.

export default function CaseFilesLayout({
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
