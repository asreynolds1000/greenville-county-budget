import { describe, expect, it } from "vitest";

import { comparisonGranularityText } from "./comparisonClaims";
import {
  getGeneralFundBudgetActualComparison,
  getGeneralFundComparisonSections,
  getGeneralFundComparisonYears,
} from "./loaders";

describe("comparison granularity claim", () => {
  it("is rendered from the row groups exported in the comparison manifest", () => {
    const sections = getGeneralFundComparisonSections();
    expect(sections).toEqual(["revenue_categories", "spending_categories"]);
    expect(comparisonGranularityText(sections))
      .toBe("by revenue category and by broad spending category");

    for (const year of getGeneralFundComparisonYears()) {
      const comparison = getGeneralFundBudgetActualComparison(year)!;
      expect(comparison.revenue_categories.length, `FY${year} revenue_categories`)
        .toBeGreaterThan(0);
      expect(comparison.spending_categories.length, `FY${year} spending_categories`)
        .toBeGreaterThan(0);
    }
  });
});
