// TODO: pull dynamically from Kit. Once a server-side fetch is in place
// (e.g. /api/kit/subscriber-count cached at the route level for ~1 hour),
// this component can read from it. For now the count is hard-coded so we
// can ship the line without coupling deploys to the Kit API.
const SUBSCRIBER_COUNT = 9840;

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
