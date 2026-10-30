import { describe, expect, it } from "vitest";
import { compareSpendingLine, regroupingBanner, shortenReason } from "./budgetComparison";
import { getSpendingComparisonData } from "./spendingSnapshots";

describe("resident spending comparisons", () => {
  const { snapshots, boundaries } = getSpendingComparisonData();

  it("answers the Sheriff's latest-year change from the published amounts", () => {
    const result = compareSpendingLine("dept.sheriff", "departments", snapshots, 2025, 2026, boundaries);
    expect(result.end?.value).toBe(80_407_123);
    expect(result.start?.value).toBe(70_914_455);
    expect(result.difference).toBe(9_492_668);
    expect(result.percent).toBeCloseTo(13.386083, 4);
  });

  it("withholds a false spending-cut claim across the FY2024 regrouping", () => {
    const result = compareSpendingLine("opcat.community-development-planning", "categories", snapshots, 2023, 2024, boundaries);
    expect(result.start?.value).toBeGreaterThan(result.end!.value!);
    expect(result.difference).toBeNull();
    expect(result.reasons.join(" ")).toContain("different groupings");
  });

  it("does not convert a newly published line into growth from zero", () => {
    const result = compareSpendingLine("opcat.department-of-administration", "categories", snapshots, 2023, 2026, boundaries);
    expect(result.start).toBeUndefined();
    expect(result.end?.value).toBe(44_035_256);
    expect(result.difference).toBeNull();
    expect(result.percent).toBeNull();
  });

  it("keeps the latest category shares on one reconciled General Fund denominator", () => {
    const year = snapshots.find((s) => s.year === 2026)!;
    expect(year.total).toBe(275_141_134);
    expect(year.categories.reduce((sum, row) => sum + row.value!, 0)).toBe(year.total);
    expect(new Set(year.departments.map((row) => row.id)).size).toBe(year.departments.length);
    expect(year.departments.every((row) => row.id.startsWith("dept.") || row.id.startsWith("opcat."))).toBe(true);
  });

  it("keeps historical statement mismatches explicit instead of silently assigning shares", () => {
    const year = snapshots.find((s) => s.year === 2005)!;
    expect(year.total).toBe(125_935_179);
    expect(year.detailTotal).toBe(118_463_012);
    expect(year.categories.reduce((sum, row) => sum + row.value!, 0)).toBe(year.detailTotal);
  });

  it("retains EMS when it is a leaf category rather than a department", () => {
    const year = snapshots.find((s) => s.year === 2018)!;
    expect(year.departments.find((row) => row.id === "opcat.emergency-medical-services")?.value).toBe(20_041_359);
    expect(year.departments.reduce((sum, row) => sum + row.value!, 0)).toBe(year.detailTotal);
  });

  it("retains a published zero but does not invent a percentage from it", () => {
    const result = compareSpendingLine("dept.indigentdefense", "departments", snapshots, 2004, 2005, boundaries);
    expect(result.start?.value).toBe(0);
    expect(result.end?.value).toBe(0);
    expect(result.difference).toBe(0);
    expect(result.percent).toBeNull();
  });
});

describe("regrouping banner", () => {
  const { boundaries, snapshots } = getSpendingComparisonData();

  it("names the longest window that avoids the recent regroupings", () => {
    const banner = regroupingBanner(boundaries, 2021, 2026);
    expect(banner?.start).toBe(2024);
    expect(banner?.message).toContain("FY2024–FY2026");
    expect(banner?.message).toContain("FY2024");
  });

  it("stays silent when the selected span crosses no regrouping", () => {
    expect(regroupingBanner(boundaries, 2025, 2026)).toBeNull();
  });

  it("names every regrouping a wide span crosses, in order", () => {
    const banner = regroupingBanner(boundaries, 2002, 2026);
    expect(banner?.start).toBe(2024);
    expect(banner?.message).toContain("FY2006");
    expect(banner?.message).toContain("FY2013");
    expect(banner?.message).toContain("FY2020");
    expect(banner?.message).toContain("FY2024");
  });

  it("covers the same boundary text the row itself withholds a change for", () => {
    const banner = regroupingBanner(boundaries, 2023, 2024);
    const row = compareSpendingLine("opcat.community-development-planning", "categories", snapshots, 2023, 2024, boundaries);
    expect(row.reasons.length).toBeGreaterThan(0);
    expect(banner?.coveredReasons).toContain(row.reasons[0]);
  });
});

describe("shortenReason", () => {
  it("leaves an already-short reason unchanged", () => {
    const short = "Moved from Public Works to Community Planning and Development in FY2024.";
    expect(shortenReason(short)).toBe(short);
  });

  it("cuts a longer explanation down to its first sentence", () => {
    const long = "First sentence here. Second sentence with more detail that goes on.";
    expect(shortenReason(long)).toBe("First sentence here.");
  });
});
