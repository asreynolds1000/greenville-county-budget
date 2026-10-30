import { getEntityPage, getSeriesPointForYear } from "./loaders";

export type GeneralFundShareContext = {
  /**
   * True exactly when `/compare/` (SpendingComparison.tsx, via getSpendingComparisonData in
   * spendingSnapshots.ts) would show a share for this fiscal year: the General Fund's own
   * adopted total and the gf.expenditures detail-hierarchy adopted total agree. Years where
   * the county's own published presentations diverge (FY2005, FY2007, FY2014 -- see napkin
   * "General Fund detail hierarchies can differ from reported fund totals") are withheld here
   * exactly as they are withheld on `/compare/`.
   */
  supported: boolean;
  /**
   * The General Fund's own adopted total for the year, or null if unpublished. This is the
   * ONLY denominator a share on a General Fund entity page is ever computed against -- never
   * a category or department subtotal -- so a service-line share here always means the same
   * thing a `/compare/` share does.
   */
  fundTotal: number | null;
  /** gf.expenditures' own adopted total for the year, shown in the withheld explanation. */
  detailTotal: number | null;
};

/**
 * The denominator policy `/compare/` already uses, re-derived directly from the same two
 * series (fund.general, gf.expenditures) it reads through spendingSnapshots.ts, for a single
 * fiscal year. See generalFundShare.test.ts for the cross-check proving this agrees with
 * `getSpendingComparisonData()` exactly, including on a withheld year.
 */
export function getGeneralFundShareContext(
  fiscalYear: number,
): GeneralFundShareContext {
  const fundPoint = getSeriesPointForYear(
    getEntityPage("fund.general"),
    fiscalYear,
  );
  const detailPoint = getSeriesPointForYear(
    getEntityPage("gf.expenditures"),
    fiscalYear,
  );
  const fundTotal =
    fundPoint?.status_class === "adopted" ? fundPoint.value : null;
  const detailTotal =
    detailPoint?.status_class === "adopted" ? detailPoint.value : null;
  return {
    supported: fundTotal !== null && detailTotal === fundTotal,
    fundTotal,
    detailTotal,
  };
}
