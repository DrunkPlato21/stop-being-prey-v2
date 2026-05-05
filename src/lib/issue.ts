import { getAllArticles, type ArticleMeta } from "./articles";

export type IssueIdentity = {
  volume: string; // Roman numeral
  number: number;
  dateLabel: string; // e.g., "Saturday, May 2, 2026"
  rawDate: string; // ISO date of the latest essay
};

// Volume I begins in the publication's first year (2026).
const FIRST_VOLUME_YEAR = 2026;

function toRoman(n: number): string {
  if (n <= 0) return "I";
  const map: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let result = "";
  let remaining = n;
  for (const [val, sym] of map) {
    while (remaining >= val) {
      result += sym;
      remaining -= val;
    }
  }
  return result;
}

/**
 * Derive the publication's current issue identity from the essay catalog.
 *
 * - Volume = Roman numeral of (latest essay's year - first volume year + 1)
 *   so 2026 -> I, 2027 -> II, etc.
 * - Number = count of essays published in the latest essay's year, which
 *   equals the index (1-based) of the latest essay within that year when
 *   sorted ascending.
 * - dateLabel = the latest essay's date formatted as the masthead expects.
 *
 * Returns null only when the catalog is empty.
 */
export function getCurrentIssue(
  articles?: ArticleMeta[]
): IssueIdentity | null {
  const list = articles ?? getAllArticles();
  if (list.length === 0) return null;

  // Articles arrive sorted descending by date from getAllArticles().
  const latest = list[0];
  const date = new Date(latest.date);
  const year = date.getFullYear();

  const volume = toRoman(year - FIRST_VOLUME_YEAR + 1);
  const number = list.filter(
    (a) => new Date(a.date).getFullYear() === year
  ).length;

  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return { volume, number, dateLabel, rawDate: latest.date };
}
