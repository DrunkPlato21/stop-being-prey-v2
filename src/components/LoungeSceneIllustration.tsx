// Vintage book-illustration line art for the Lounge masthead. Two
// wingback chairs flanking a side table with a banker's lamp, an
// arched window behind, a small rug underneath. Olive monochrome
// via currentColor — the parent sets the color via the text-eye-deep
// class so the page can adjust if the palette ever shifts.

export function LoungeSceneIllustration() {
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      viewBox="0 0 360 110"
      width="100%"
      style={{
        display: "block",
        maxWidth: 360,
        height: "auto",
        color: "var(--eye-deep)",
        opacity: 0.78,
      }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Floor */}
      <line x1="20" y1="98" x2="340" y2="98" />

      {/* Rug — two parallel lines under the centerpiece */}
      <path d="M115 102 Q180 108 245 102" />
      <path d="M125 105 Q180 110 235 105" />

      {/* Window — arched, behind the centerpiece */}
      <path d="M150 24 Q180 4 210 24 L210 70 L150 70 Z" />
      <line x1="180" y1="14" x2="180" y2="70" />
      <line x1="150" y1="46" x2="210" y2="46" />
      {/* Window sill */}
      <line x1="146" y1="70" x2="214" y2="70" />

      {/* Left wingback chair */}
      {/* Back + wing */}
      <path d="M58 98 L58 55 Q58 38 70 38 Q86 38 86 55 L86 98" />
      {/* Outer wing curve */}
      <path d="M58 55 Q50 50 50 62 L50 95" />
      {/* Front arm */}
      <path d="M86 78 L100 78 L100 98" />
      {/* Front arm outer */}
      <path d="M100 78 Q108 78 108 88 L108 98" />
      {/* Seat */}
      <line x1="86" y1="78" x2="100" y2="78" />
      <path d="M58 78 L86 78" />
      {/* Seat cushion curve */}
      <path d="M62 72 Q80 68 100 72" />

      {/* Right wingback chair (mirrored) */}
      <path d="M302 98 L302 55 Q302 38 290 38 Q274 38 274 55 L274 98" />
      <path d="M302 55 Q310 50 310 62 L310 95" />
      <path d="M274 78 L260 78 L260 98" />
      <path d="M260 78 Q252 78 252 88 L252 98" />
      <line x1="274" y1="78" x2="260" y2="78" />
      <path d="M302 78 L274 78" />
      <path d="M298 72 Q280 68 260 72" />

      {/* Side table */}
      <line x1="170" y1="98" x2="170" y2="80" />
      <line x1="190" y1="98" x2="190" y2="80" />
      <line x1="165" y1="80" x2="195" y2="80" />

      {/* Banker's lamp on the table */}
      {/* Base */}
      <line x1="176" y1="80" x2="184" y2="80" />
      {/* Pole */}
      <line x1="180" y1="80" x2="180" y2="64" />
      {/* Shade */}
      <path d="M170 64 L190 64 L186 56 L174 56 Z" />
      {/* Shade brim hint */}
      <line x1="170" y1="64" x2="190" y2="64" />

      {/* A single drifting suggestion of pipe smoke / warmth above the lamp */}
      <path
        d="M180 52 Q177 48 180 44 Q183 40 180 36"
        strokeOpacity="0.55"
      />
    </svg>
  );
}
