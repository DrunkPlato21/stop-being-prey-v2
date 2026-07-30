/**
 * Section divider. Plain centered rule.
 * Placeholder for a future mark (e.g. a cropped real-photo cat eye).
 */
export function EyeDivider({
  className = "",
  style,
}: {
  className?: string;
  /** Escape hatch for the divider's own spacing. The base rule carries
      4rem top and bottom, which is right between two full sections but
      far too much where two blocks should read as one continuous beat.
      Inline so a caller can tighten it without a second CSS class. */
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`eye-divider ${className}`}
      style={style}
      aria-hidden="true"
      role="separator"
    >
      <span className="eye-divider-rule" />
    </div>
  );
}
