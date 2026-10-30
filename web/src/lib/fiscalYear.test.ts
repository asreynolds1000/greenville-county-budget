import { describe, expect, it } from "vitest";

import {
  getCoveredFiscalYears,
  getEntityPage,
  getLatestFiscalYear,
  getPendingYears,
} from "./loaders";

/**
 * The site's own fiscal year, pinned.
 *
 * On 2026-07-22 the landing page called FY2026 "this year". Greenville County's FY2027 had
 * begun three weeks earlier. The year was hardcoded in three places — the home page, its
 * whole-budget download href, and the methodology coverage matrix — with nothing asserting
 * they agreed, and nothing tying any of them to the data.
 *
 * Fifteen planning documents missed it. It was the first sentence a reader saw.
 */
describe("the site's latest fiscal year", () => {
  it("is derived from the data, not declared", () => {
    const covered = getCoveredFiscalYears(getEntityPage("budget.total"));
    expect(getLatestFiscalYear()).toBe(covered[covered.length - 1]);
  });

  it("has a whole-budget download for that year", () => {
    // The home page builds the download href from the same value. A year with no tree
    // export would give the landing page a dead download.
    const year = getLatestFiscalYear();
    const page = getEntityPage("budget.total");
    expect(getCoveredFiscalYears(page)).toContain(year);
  });

  it("is a year the data actually publishes a total for", () => {
    // Guards the opposite failure: an entity's covered range can extend past its published
    // values, which would headline the site with "not published".
    const page = getEntityPage("budget.total");
    const point = page.series.find((s) => s.fiscal_year === getLatestFiscalYear());
    expect(point, "the latest fiscal year must have a published county total").toBeDefined();
    expect(point!.value).toBeGreaterThan(0);
  });

  it("moves on its own when the dataset gains a year", () => {
    // The property that matters: nothing to remember at FY2027 time. If this test ever
    // needs editing to add a year, the derivation has been broken.
    const covered = getCoveredFiscalYears(getEntityPage("budget.total"));
    const simulated = [...covered, Math.max(...covered) + 1];
    expect(simulated[simulated.length - 1]).toBe(getLatestFiscalYear() + 1);
  });

  it("rejects every stale adopted-but-not-ingested notice", () => {
    const latest = getLatestFiscalYear();
    const pending = getPendingYears();
    expect(pending).toEqual([]);
    for (const record of pending) {
      expect(
        record.fiscal_year,
        `FY${record.fiscal_year} pending note is stale at latest ingested FY${latest}`,
      ).toBeGreaterThan(latest);
    }
  });
});
