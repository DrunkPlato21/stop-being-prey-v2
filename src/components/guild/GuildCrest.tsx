// The Guild's mark: an engraved medallion holding the cat's eye, the
// brand's one recurring motif (the predator's gaze, the whole "stop being
// prey" idea). Outline-engraved rather than a filled wax blob, to match
// the lit-mag aesthetic and keep olive the restrained accent it is. Used
// at the masthead as the room's signature; the "read by Clay" seal is its
// small sibling.

export function GuildCrest({ size = 64 }: { size?: number }) {
  // Six short ticks evenly around the ring for the struck-seal feel.
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
        // Round so server and client serialize identical strings (raw
        // trig floats differ in their last digit and trip hydration).
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
      {/* The cat's eye */}
      <path
        d="M13 32 C20 23, 44 23, 51 32 C44 41, 20 41, 13 32 Z"
        stroke="var(--eye-deep)"
        strokeWidth="1.3"
      />
      <ellipse cx="32" cy="32" rx="4.4" ry="8" fill="var(--eye-deep)" />
    </svg>
  );
}
