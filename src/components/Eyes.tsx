/**
 * Section divider — plain centered rule.
 * Placeholder for a future mark (e.g. a cropped real-photo cat eye).
 */
export function EyeDivider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`eye-divider ${className}`}
      aria-hidden="true"
      role="separator"
    >
      <span className="eye-divider-rule" />
    </div>
  );
}
