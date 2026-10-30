/**
 * Which fiscal years a source document is the book *for*.
 *
 * Used to decide whether a citation needs the "as printed in" prefix. Latest-book-wins is
 * the right policy, but a bare later year under an earlier figure reads like an error to a
 * resident checking the source (cold-review finding F8), so a figure cited to a LATER book
 * says so.
 *
 * The subtlety, and the reason this is not a one-line regex at three call sites: the county
 * publishes two-year books. `FY2024-25` is the book for FY2024 AND FY2025. Taking the first
 * four digits — which every call site was doing — makes every second year of every biennium
 * look like it was cited to someone else's book, which is the opposite of the fix: it prints
 * a caveat where there is nothing to caveat, on roughly half the rows in a fifteen-year
 * table. A caveat that fires on half the rows is read as noise, and then the ones that
 * matter are read as noise too.
 *
 * Codes seen in the registry: `FY2026`, `FY2024-25`, `FY2012-ACFR`.
 */
export function sourceCoversFiscalYear(sourceCode: string, fiscalYear: number): boolean {
  const match = /^FY(\d{4})(?:-(\d{2}|\d{4}))?/.exec(sourceCode);
  if (!match) return false;

  const start = Number(match[1]);
  if (match[2] === undefined) return fiscalYear === start;

  // A two-digit tail is the second year of a biennium in the same century ("FY2024-25").
  // A non-numeric tail (`-ACFR`) is a qualifier on a single year, and the regex leaves
  // match[2] undefined for it, so it never reaches here.
  const tail = Number(match[2]);
  let end = match[2].length === 2 ? Math.floor(start / 100) * 100 + tail : tail;
  // A biennium spanning a century ("FY2099-00") lands the tail in the wrong hundred.
  // Not reachable from today's registry; stated rather than left to be accidentally right.
  if (end < start) end += 100;

  return fiscalYear >= start && fiscalYear <= end;
}
