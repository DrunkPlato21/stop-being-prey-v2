import { countAllMembers } from "@/lib/members";

// Live member count for the paid side of conversion surfaces — the
// parallel to SubscriberCount on the free side. countAllMembers() is a
// single ZCARD (cheap) and is the honest "joined ever" figure. Falls back
// to a believable floor (the 100 founder seats are already full) if Redis
// is briefly unreachable, so the line always renders a real-looking number.
const FALLBACK_MEMBERS = 100;

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export async function MemberCount({
  className = "",
}: {
  className?: string;
}) {
  const live = await countAllMembers();
  const count = live > 0 ? live : FALLBACK_MEMBERS;
  return (
    <p className={`eyebrow ${className}`} aria-live="polite">
      Join {formatCount(count)} in the room.
    </p>
  );
}
