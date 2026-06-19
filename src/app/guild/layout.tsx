import { MemberNavServer } from "@/components/MemberNavServer";

// Layout for /guild. Mirrors /lounge, /desk, and /case-files so the
// member sidebar (and the way back to the Desk) is present on every
// member surface, including inside individual threads.

export default function GuildLayout({
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
