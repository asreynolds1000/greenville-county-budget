import { describe, expect, it } from "vitest";

import {
  breaksBetween,
  buildEntityHistoryModel,
  compareHistoryYears,
  defaultComparisonStartYear,
  describeTrendSpanChange,
  getBasis,
  getRecentTrendWindow,
  historyBreaksFromLegacy,
  historyBreaksFromNotes,
  historySeriesKind,
  type HistoryComparison,
} from "./history";
import { getEntityPage, getV2EntityPage, seriesBreakNotesAt } from "./loaders";

function notesFor(pageId: string) {
  const page = getV2EntityPage(pageId);
  const years = page.series.map((point) => point.fiscal_year);
  const kind = historySeriesKind(page);
  return historyBreaksFromNotes([...new Map(years.flatMap((year) => (
    seriesBreakNotesAt(year, kind, page.entity_id)
  )).map((note) => [note.note_id, note])).values()]);
}

describe("entity history comparison", () => {
  it("keeps each status and measure in its own basis", () => {
    const sheriff = getV2EntityPage("dept.sheriff");
    const model = buildEntityHistoryModel(sheriff, 2026, notesFor("dept.sheriff"));

    expect(model.bases.map((basis) => basis.statusClass)).toEqual(["actual", "adopted", "projected"]);
    expect(model.bases.find((basis) => basis.statusClass === "actual")?.points)
      .toHaveLength(1);
    expect(model.defaultBasisKey).toContain("adopted");
  });

  it("defaults to the prior comparable fiscal year without skipping a gap", () => {
    const wholeBudget = getV2EntityPage("budget.total");
    const model = buildEntityHistoryModel(wholeBudget, 2026, notesFor("budget.total"));
    const basis = getBasis(model, model.defaultBasisKey)!;

    expect(defaultComparisonStartYear(basis, 2026, model.breaks)).toBe(2025);

    const engineering = getV2EntityPage("dept.engineering");
    const engineeringModel = buildEntityHistoryModel(engineering, 2014, notesFor("dept.engineering"));
    const engineeringBasis = getBasis(engineeringModel, engineeringModel.defaultBasisKey)!;
    expect(defaultComparisonStartYear(engineeringBasis, 2014, engineeringModel.breaks)).toBeNull();
  });

  it("withholds a growth calculation when a curated break lies between endpoints", () => {
    const engineering = getV2EntityPage("dept.engineering");
    const model = buildEntityHistoryModel(engineering, 2016, notesFor("dept.engineering"));
    const basis = getBasis(model, model.defaultBasisKey)!;
    const comparison = compareHistoryYears(basis, 2015, 2016, model.breaks);

    expect(comparison.start?.value).toBe(970_760);
    expect(comparison.end?.value).toBe(5_586_265);
    expect(comparison.difference).toBeNull();
    expect(comparison.percentDifference).toBeNull();
    expect(comparison.withholdingNotes.map((note) => note.id))
      .toContain("note.fy2016-engineering-consolidation:2016");
  });

  it("splits trend segments at every applicable break without applying department breaks to funds", () => {
    const sheriff = getV2EntityPage("dept.sheriff");
    const sheriffModel = buildEntityHistoryModel(sheriff, 2026, notesFor("dept.sheriff"));
    const sheriffBasis = getBasis(sheriffModel, sheriffModel.defaultBasisKey)!;
    const trend = getRecentTrendWindow(sheriffBasis, 2026, sheriffModel.breaks);

    expect(trend.supportedFiveYearRange).toBe(false);
    expect(trend.unavailableReason).toBe("break");
    expect(trend.segments.map((segment) => segment.map((point) => point.fiscal_year)))
      .toEqual([[2022, 2023], [2024, 2025, 2026]]);

    const countyNotes = notesFor("budget.total");
    expect(countyNotes).toEqual([]);
    expect(breaksBetween(countyNotes, 2022, 2026)).toEqual([]);
  });

  it("reports missing annual observations instead of joining them into a five-year range", () => {
    const engineering = getV2EntityPage("dept.engineering");
    const model = buildEntityHistoryModel(engineering, 2016, notesFor("dept.engineering"));
    const basis = getBasis(model, model.defaultBasisKey)!;
    const trend = getRecentTrendWindow(basis, 2016, model.breaks);

    expect(trend.supportedFiveYearRange).toBe(false);
    // FY2016 also carries the curated consolidation break. The chart still retains the
    // missing FY2012–13 positions rather than joining 2011 to 2014.
    expect(trend.unavailableReason).toBe("break");
    expect([...trend.pointsByYear.keys()]).toEqual([2014, 2015, 2016]);
  });

  it("recognises a complete selected interval longer than five years", () => {
    const county = getV2EntityPage("budget.total");
    const model = buildEntityHistoryModel(county, 2026, notesFor("budget.total"));
    const basis = getBasis(model, model.defaultBasisKey)!;
    const trend = getRecentTrendWindow(basis, 2026, model.breaks, 2016);

    expect(trend.continuousRange).toBe(true);
    expect(trend.supportedFiveYearRange).toBe(false);
    expect([...trend.pointsByYear.keys()]).toEqual(Array.from({ length: 11 }, (_, index) => 2016 + index));
  });

  it("makes legacy gaps and parent changes visible comparison boundaries", () => {
    const engineering = getEntityPage("dept.engineering");
    const legacy = historyBreaksFromLegacy(engineering.breaks);
    expect(legacy.map((item) => item.kind)).toEqual(["gap", "parent_change"]);
    expect(breaksBetween(legacy, 2005, 2014).map((item) => item.kind)).toEqual(["gap", "parent_change"]);
  });
});

describe("describeTrendSpanChange", () => {
  const comparisonWith = (difference: number | null, percentDifference: number | null): HistoryComparison => ({
    difference,
    end: null,
    gapYears: [],
    percentDifference,
    reason: difference === null ? "missing-endpoint" : null,
    start: null,
    withholdingNotes: [],
  });

  it("states an increase in dollars and a rounded percent", () => {
    expect(describeTrendSpanChange(comparisonWith(158_280_642, 49.625050061825235), 2022, 2026))
      .toBe("Up $158,280,642 (+49.6%) from FY2022 to FY2026.");
  });

  it("states a decrease in dollars and a rounded percent, without a double negative sign", () => {
    expect(describeTrendSpanChange(comparisonWith(-12_000_000, -8.256), 2020, 2024))
      .toBe("Down $12,000,000 (-8.3%) from FY2020 to FY2024.");
  });

  it("says no change when the two endpoints are identical, rather than printing 0.0%", () => {
    expect(describeTrendSpanChange(comparisonWith(0, 0), 2019, 2023))
      .toBe("No change from FY2019 to FY2023.");
  });

  it("returns null instead of a sentence when the endpoints are not comparable — a split or missing-year window", () => {
    expect(describeTrendSpanChange(comparisonWith(null, null), 2022, 2026)).toBeNull();
  });

  it("ties the real Total Budget FY2022-FY2026 endpoints to the site's own percent convention", () => {
    const county = getV2EntityPage("budget.total");
    const model = buildEntityHistoryModel(county, 2026, notesFor("budget.total"));
    const basis = getBasis(model, model.defaultBasisKey)!;
    const comparison = compareHistoryYears(basis, 2022, 2026, model.breaks);
    expect(describeTrendSpanChange(comparison, 2022, 2026))
      .toBe("Up $158,280,642 (+49.6%) from FY2022 to FY2026.");
  });

  it("returns null for the same real entity-window a chart would never attach a sentence to (a curated break)", () => {
    const sheriff = getV2EntityPage("dept.sheriff");
    const model = buildEntityHistoryModel(sheriff, 2026, notesFor("dept.sheriff"));
    const basis = getBasis(model, model.defaultBasisKey)!;
    const trend = getRecentTrendWindow(basis, 2026, model.breaks);
    expect(trend.supportedFiveYearRange).toBe(false);
    const comparison = compareHistoryYears(basis, trend.startYear, trend.endYear, model.breaks);
    expect(describeTrendSpanChange(comparison, trend.startYear, trend.endYear)).toBeNull();
  });
});
