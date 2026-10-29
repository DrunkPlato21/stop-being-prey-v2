"use client";

// The read mark on an archive row: a hairline circle when unread, a gold
// check when read. A button of its own (the row beside it is a link), so
// a patron can tick off the emails they already read in their inbox
// without opening each one.

export function ReadMark({
  read,
  subject,
  onToggle,
}: {
  read: boolean;
  subject: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`ar-readmark${read ? " is-read" : ""}`}
      aria-pressed={read}
      aria-label={read ? `Mark “${subject}” unread` : `Mark “${subject}” read`}
      title={read ? "Read. Tap to mark unread." : "Mark as read"}
      onClick={onToggle}
    >
      <svg viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="8.25" />
        {read && <path d="M6.2 10.4l2.6 2.6 5-5.4" />}
      </svg>
    </button>
  );
}
