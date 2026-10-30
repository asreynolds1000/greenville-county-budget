import { Amount } from "@/components/Amount";
import type { GeneralFundShareContext } from "@/lib/generalFundShare";

/**
 * The denominator, named once above a list of General Fund service-line shares -- never
 * repeated per row, and never a different number than `/compare/` prints for the same year.
 *
 * Withheld wording is copied from SpendingComparison.tsx's own withheld paragraph (the
 * source of the policy this whole feature reuses), with the fiscal year substituted in.
 * That component is out of scope for edits, so this is deliberately independent text kept in
 * sync by hand rather than a shared import -- see napkin.
 */
export function GeneralFundShareNote({
  context,
  year,
}: {
  context: GeneralFundShareContext;
  year: number;
}) {
  if (context.supported) {
    return (
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
        Shares of the <Amount value={context.fundTotal} printedForm={null} />{" "}
        General Fund total, including transfers to other funds.
      </p>
    );
  }

  return (
    <p className="mt-2 border-l-2 border-accent pl-3 text-sm leading-relaxed text-ink-secondary">
      Budget shares are withheld for FY{year}. The expenditure detail totals{" "}
      <Amount value={context.detailTotal} printedForm={null} />, which does not
      match the General Fund total above. These are different published
      presentations; the difference is not an unlisted service or an amount to
      allocate.
    </p>
  );
}
