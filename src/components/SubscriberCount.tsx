import { getSubscriberCount } from "@/lib/kit";

// Live active-subscriber count from Kit, cached ~1h in getSubscriberCount
// so render traffic never hammers the API. Falls back to a recent static
// floor when Kit is unreachable, so the line always renders a believable
// number. Self-corrects after list purges/growth without a hand-edit.
const FALLBACK_COUNT = 9000;

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

type SubscriberCountProps = {
  className?: string;
};

export async function SubscriberCount({
  className = "",
}: SubscriberCountProps) {
  const live = await getSubscriberCount();
  const count = live ?? FALLBACK_COUNT;
  return (
    <p className={`eyebrow ${className}`} aria-live="polite">
      Joining {formatCount(count)} readers.
    </p>
  );
}
