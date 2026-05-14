// Small desk-lamp SVG used as the writer-at-the-desk presence icon.
// Outline always renders in the gold accent (var(--eye-deep)); when
// `lit` flips on, .desk-lamp-lit emits a warm 2.5s halo pulse.
//
// Lives in its own file so the Writer's Desk widget and the site
// chrome's presence indicator can share the exact same glyph without
// drift.

export function DeskLamp({
  lit,
  size = 22,
}: {
  lit: boolean;
  size?: number;
}) {
  return (
    <svg
      role="img"
      aria-label="Desk lamp"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={lit ? "desk-lamp desk-lamp-lit" : "desk-lamp"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.5 10.5 Q12 3 18.5 10.5" />
      <path d="M5 10.5 L19 10.5" />
      <path d="M12 10.5 L12 18.5" />
      <path d="M8 18.5 L16 18.5 L17 20.5 L7 20.5 Z" />
    </svg>
  );
}
