// Default initial-circle avatar. Cream interior, thin olive border,
// olive serif initial. Used across the comment system and (eventually)
// any other surface that surfaces a member identity inline. Photo
// upload is deferred to V2; every member sees the same uniform
// treatment for V1.

export function InitialAvatar({
  displayName,
  size = 30,
  alt,
}: {
  displayName: string;
  /** Pixel diameter. Defaults to 30, matching the header IdentityMenu. */
  size?: number;
  alt?: string;
}) {
  const trimmed = displayName.trim();
  const initial = (trimmed[0] || "?").toUpperCase();
  return (
    <span
      role="img"
      aria-label={alt ?? `${trimmed || "Member"} avatar`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--paper)",
        border: "1px solid var(--eye-deep)",
        color: "var(--eye-deep)",
        fontFamily:
          "var(--font-cormorant), 'EB Garamond', Georgia, serif",
        fontSize: `${Math.round(size * 0.42)}px`,
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initial}
    </span>
  );
}
