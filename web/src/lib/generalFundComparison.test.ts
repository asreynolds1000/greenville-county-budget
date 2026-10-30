import { describe, expect, it } from "vitest";

import {
  getGeneralFundBudgetActualComparison,
  getGeneralFundComparisonYears,
} from "./loaders";

describe("FY2025 General Fund budget and actual comparison", () => {
  it("reconciles the detailed revenue and spending contributions to the audited totals", () => {
    const comparison = getGeneralFundBudgetActualComparison(2025);
    expect(comparison).not.toBeNull();

    const revenue = comparison!.revenue_categories.reduce(
      (totals, item) => ({
        actual: totals.actual + item.actual,
        budget: totals.budget + item.budget,
        contribution: totals.contribution + item.contribution,
      }),
      { actual: 0, budget: 0, contribution: 0 },
    );
    expect(revenue).toEqual({
      actual: 246_871_125,
      budget: 223_764_269,
      contribution: 23_106_856,
    });

    const spending = comparison!.spending_categories.reduce(
      (totals, item) => ({
        actual: totals.actual + item.actual,
        budget: totals.budget + item.budget,
        contribution: totals.contribution + item.contribution,
      }),
      { actual: 0, budget: 0, contribution: 0 },
    );
    expect(spending).toEqual({
      actual: 251_720_397,
      budget: 241_649_556,
      contribution: -10_070_841,
    });
  });

  it("offers no comparison for a year with no audited actual", () => {
    // FY2026 is adopted-budget-only until its ACFR is published (expected ~Dec 2026).
    // Rendering it as a comparison would imply an audited result that does not exist.
    expect(getGeneralFundBudgetActualComparison(2026)).toBeNull();
    expect(getGeneralFundBudgetActualComparison(2010)).toBeNull();
  });

  it("covers every audited year FY2011 through FY2025", () => {
    const years = getGeneralFundComparisonYears();
    expect(years).toEqual(
      Array.from({ length: 15 }, (_, index) => 2011 + index),
    );
    for (const year of years) {
      const comparison = getGeneralFundBudgetActualComparison(year);
      expect(comparison, `FY${year} comparison should load`).not.toBeNull();
      expect(comparison!.fiscal_year).toBe(year);
      expect(comparison!.revenue_categories.length).toBeGreaterThan(0);
      expect(comparison!.spending_categories.length).toBeGreaterThan(0);
    }
  });

  it("carries the county's printed wording alongside the display label", () => {
    // The county's own labels drift, so a citation is only checkable if the printed
    // wording ships with it. FY2025 prints "Elected officials - law enforcement:" for
    // the line a resident reads as "Law enforcement".
    const comparison = getGeneralFundBudgetActualComparison(2025)!;
    const lawEnforcement = comparison.spending_categories.find(
      (row) => row.canonical_key === "law_enforcement",
    );
    expect(lawEnforcement?.label).toBe("Law enforcement");
    expect(lawEnforcement?.source_label).toBe("Elected officials - law enforcement:");
  });

  it("derives the FY2018 Public safety budget the county omitted", () => {
    // The FY2018 ACFR prints dashes on the Total public safety budget columns. The value
    // is the sum of its printed sub-departments, and the county's own printed variance of
    // 401,312 confirms it. A zero here would show a fabricated $27.4M overspend.
    const comparison = getGeneralFundBudgetActualComparison(2018)!;
    const publicSafety = comparison.spending_categories.find(
      (row) => row.canonical_key === "public_safety",
    );
    expect(publicSafety?.budget).toBe(27_764_075);
    expect(publicSafety?.actual).toBe(27_362_763);
    expect(publicSafety?.contribution).toBe(401_312);
  });
});
