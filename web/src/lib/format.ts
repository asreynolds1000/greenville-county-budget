/**
 * Formatters that cannot lie (plan Decision 4.3). Kept as a plain function,
 * separate from the Amount component, so the null-vs-zero contract is unit
 * testable without a DOM (see format.test.ts).
 */

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Formats a nullable dollar amount for display.
 *
 * - `null` means no canonical value of the entity's status class was
 *   published for this fiscal year (T1: "absent ≠ zero") — renders
 *   "not published", never "$0" and never blank.
 * - `0` means the county published a real zero (e.g. dept.indigentdefense
 *   FY2004-05; plan Y4) — renders "$0", never "not published".
 */
export function formatAmount(value: number | null): string {
  if (value === null) return "not published";
  return currencyFormatter.format(value);
}

/**
 * The label to show a reader, given anything that carries a name.
 *
 * The county prints most department labels in full capitals, and a few carry OCR damage or
 * a typo. `display_name` is the curated resident-facing form, loaded from
 * `data/production/entity_presentation.csv`; `canonical_name` stays exactly as printed and
 * is what provenance, citations and downloads continue to use.
 *
 * One function rather than `?? canonical_name` at each call site, because the failure mode
 * is a component that forgets and shows SHERIFF next to five title-cased neighbours —
 * which reads as a data error rather than a missed fallback.
 *
 * Deliberately NOT a title-case transform. A mechanical one would produce "Gis", "E-911"
 * has already been corrected by hand, and no function can know which words in an
 * uninventoried set are acronyms.
 */
export function displayName(
  entity: { display_name?: string | null; canonical_name: string } | null | undefined,
): string {
  if (!entity) return "";
  return entity.display_name || entity.canonical_name;
}

/**
 * Spells out a citation source code's ACFR qualifier the first time a reader sees it, so
 * "FY2025-ACFR" does not sit unexplained next to a page number. Budget-book codes
 * (`FY2025`, `FY2024-25`) print exactly as recorded, since those already read as a year,
 * not an acronym.
 *
 * The registry mints ACFR codes as a single fiscal year plus the suffix, never a range
 * (see sourceYears.ts), so a plain anchored match is sufficient and will not misfire on a
 * biennium.
 */
export function describeSourceCode(sourceCode: string): string {
  const match = /^(FY\d{4})-ACFR$/.exec(sourceCode);
  if (!match) return sourceCode;
  return `${match[1]} audited financial report (ACFR)`;
}
