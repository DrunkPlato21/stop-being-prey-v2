// The Lounge's mark: sibling to the Guild crest. Same engraved medallion
// and struck-seal ticks so the two rooms read as a matched set, but the
// center motif is a club armchair instead of the cat's eye. The Guild is
// where you study; the Lounge is the comfortable room you sink into. A
// quiet olive engraving, ornament not icon.

export function LoungeMark({ size = 64 }: { size?: number }) {
  // Six short ticks evenly around the ring, matching GuildCrest.
  const ticks = [0, 60, 120, 180, 240, 300];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="30" stroke="var(--eye-deep)" strokeWidth="1.1" />
      <circle
        cx="32"
        cy="32"
        r="25.5"
        stroke="var(--eye-deep)"
        strokeWidth="0.5"
        opacity="0.5"
      />
      {ticks.map((deg) => {
        const r = (deg * Math.PI) / 180;
        // Round so server/client serialize identical strings (raw trig
        // floats differ in their last digit and trip hydration).
        const round = (n: number) => Math.round(n * 1000) / 1000;
        const x1 = round(32 + Math.cos(r) * 27);
        const y1 = round(32 + Math.sin(r) * 27);
        const x2 = round(32 + Math.cos(r) * 29.5);
        const y2 = round(32 + Math.sin(r) * 29.5);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--eye-deep)"
            strokeWidth="1"
            opacity="0.7"
          />
        );
      })}
      {/* A club armchair, front on: the comfortable seat of the room.
          One continuous silhouette (arms low, back high) plus a seat
          edge, a cushion line, and two stub legs. */}
      <g
        stroke="var(--eye-deep)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M17 41 V30 Q17 26 21 26 H22 V24 Q22 19 27 19 H37 Q42 19 42 24 V26 H43 Q47 26 47 30 V41" />
        <path d="M17 41 H47" />
        <path d="M23 34 H41" />
        <path d="M20 41 V44" />
        <path d="M44 41 V44" />
      </g>
    </svg>
  );
}
