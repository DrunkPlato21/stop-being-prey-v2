// Fallback subscriber count. Used when a live Kit fetch is unavailable
// (next step: a server-side /api/kit/subscriber-count cached ~1 hour, so
// this self-corrects after list purges instead of needing a hand-edit).
// Kept current as the static floor in the meantime.
const SUBSCRIBER_COUNT = 9222;

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

type SubscriberCountProps = {
  className?: string;
};

export function SubscriberCount({ className = "" }: SubscriberCountProps) {
  return (
    <p className={`eyebrow ${className}`} aria-live="polite">
      Joining {formatCount(SUBSCRIBER_COUNT)} readers.
    </p>
  );
}
