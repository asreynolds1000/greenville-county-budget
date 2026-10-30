import { describe, expect, it } from "vitest";

import {
  getGeneralFundComparisonYears,
  getGeneralFundFullLoopYears,
  getGeneralFundYearGroups,
  getV2CoveredFiscalYears,
  getV2EntityPage,
} from "./loaders";

/**
 * The year control's coverage, tested where the defect actually lived.
 *
 * Before this, the control offered `getGeneralFundFullLoopYears()` alone and sixteen years
 * had a route with nothing linking to it. The cold review's first finding was that the
 * plan's own fix still omitted FY2002–FY2010, so the property worth pinning is not "the
 * groups contain the ranges we expect" — it is the exhaustiveness and disjointness of the
 * partition, which stays true as the dataset grows.
 */
describe("General Fund year groups", () => {
  const routeYears = getV2CoveredFiscalYears(getV2EntityPage("fund.general"));
  const groups = getGeneralFundYearGroups();
  const grouped = groups.flatMap((group) => group.years);

  it("covers every year the route serves", () => {
    // The regression that started this: a year with a page and no way to reach it.
    const missing = routeYears.filter((year) => !grouped.includes(year));
    expect(missing, `years with a route but no group: ${missing.join(", ")}`).toEqual([]);
  });

  it("places each year in exactly one group", () => {
    const duplicated = grouped.filter((year, index) => grouped.indexOf(year) !== index);
    expect(duplicated, `years listed twice: ${duplicated.join(", ")}`).toEqual([]);
    expect(grouped).toHaveLength(routeYears.length);
  });

  it("invents no year the route cannot serve", () => {
    // The opposite failure: a control offering a link that 404s.
    const phantom = grouped.filter((year) => !routeYears.includes(year));
    expect(phantom, `years offered but not routed: ${phantom.join(", ")}`).toEqual([]);
  });

  it("sorts each group oldest to newest", () => {
    for (const group of groups) {
      expect([...group.years].sort((a, b) => a - b), group.key).toEqual(group.years);
    }
  });

  it("gives every group a label and a description", () => {
    // A group heading that says only "Partial" tells a reader nothing about what they will
    // get if they click a year underneath it.
    for (const group of groups) {
      expect(group.label, group.key).toBeTruthy();
      expect(group.description, group.key).toBeTruthy();
    }
  });

  it("matches the underlying statement and comparison coverage", () => {
    // Ties the partition back to its sources, so a change in either one is visible here
    // rather than silently reshuffling the control.
    const fullLoop = groups.find((group) => group.key === "full-loop");
    expect(fullLoop?.years).toEqual(getGeneralFundFullLoopYears());

    const comparison = groups.find((group) => group.key === "comparison");
    const fullLoopSet = new Set(getGeneralFundFullLoopYears());
    expect(comparison?.years ?? []).toEqual(
      getGeneralFundComparisonYears().filter((year) => !fullLoopSet.has(year)),
    );
  });

  it("keeps the groups in descending order of what they offer", () => {
    // Complete first: a reader scanning the control should meet the most complete years
    // before the partial ones, not after.
    expect(groups.map((group) => group.key)).toEqual(["full-loop", "comparison", "partial"]);
  });
});
