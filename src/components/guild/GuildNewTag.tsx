// "New since your last visit" tag. Soft olive wash, quiet: a scan cue, not
// a badge. Shared by the index (threads with newer activity) and the thread
// page (replies posted since you last opened it) so the one word means the
// same thing in both rooms and can't drift apart.

export function GuildNewTag({ label = "New" }: { label?: string }) {
  return (
    <span
      className="font-display uppercase"
      style={{
        color: "var(--eye-deep)",
        background: "rgba(184, 168, 44, 0.12)",
        fontSize: "0.56rem",
        fontWeight: 700,
        letterSpacing: "0.14em",
        padding: "0.12rem 0.42rem",
        borderRadius: 2,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
