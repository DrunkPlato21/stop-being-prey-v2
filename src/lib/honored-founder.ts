// Founder numbers above the public cap of 100 are hand-given grants
// (scripts/mint-founder-access.mjs), not sold seats. They display as
// "Honored Founder" with no number, so the public "100 of 100" stays
// true and nobody reads a count off the badge (Clay, Oct 18 2026).
// Kept dependency-free so client components can import it.
export const PUBLIC_FOUNDER_CAP = 100;

export function isHonoredFounder(slot: number | null | undefined): boolean {
  return typeof slot === "number" && slot > PUBLIC_FOUNDER_CAP;
}
