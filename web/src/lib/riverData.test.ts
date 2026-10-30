import { describe, expect, it } from "vitest";

import { getCountyRiver, getGeneralFundRiver, getRiverYears } from "./riverData";

function sum(values: Array<{ value: number }>): number {
  return values.reduce((total, item) => total + item.value, 0);
}

describe("FY2026 river models", () => {
  it("builds the four-fund authority allocation without inventing a countywide revenue total", () => {
    const river = getCountyRiver(2026);

    expect(river).toMatchObject({
      id: "county",
      authority: 477_233_755,
      centerLabel: "County-published total of four fund groups; a transfer between them is counted in both",
      sources: [],
      sourceTotal: null,
      reserve: null,
    });
    if (!river) return;
    expect(sum(river.uses)).toBe(river.authority);
    expect(river.uses.map((node) => [node.id, node.value])).toEqual([
      ["fund.general", 275_141_134],
      ["fund.special-revenue", 133_984_290],
      ["fund.debt-service", 34_885_734],
      ["fund.enterprise", 33_222_597],
    ]);
    expect(river.coverageNote).toMatch(/Countywide revenue is not shown/i);
    expect(river.uses.every((node) => node.href !== null && node.citation.sourceCode === "FY2026")).toBe(true);
  });

  it("builds a fully reconciled General Fund model, keeping savings and transfers outside revenue", () => {
    const river = getGeneralFundRiver(2026);

    expect(river).not.toBeNull();
    if (!river) return;
    expect(river.authority).toBe(275_141_134);
    expect(river.sourceTotal).toBe(269_091_862);
    expect(river.reserve).toMatchObject({
      kind: "reserve",
      value: 6_049_272,
      label: "Planned use of fund balance",
    });
    expect(sum(river.sources) + (river.reserve?.value ?? 0)).toBe(river.authority);
    expect(sum(river.uses)).toBe(river.authority);
    expect(river.sources.map((node) => [node.id, node.value])).toEqual([
      ["rev.property-taxes", 158_487_600],
      ["rev.county-offices", 52_972_537],
      ["rev.intergovernmental", 29_444_643],
      ["rev.other", 6_772_089],
      ["fin.gf.transfers-in", 21_414_993],
    ]);
    expect(river.uses.at(-1)).toMatchObject({
      id: "fin.gf.transfers-out",
      kind: "transfer",
      value: 8_502_046,
      href: "/e/fund.general/?fy=2026#money-out",
    });
    expect(river.sources.at(-1)).toMatchObject({
      id: "fin.gf.transfers-in",
      kind: "transfer",
      href: "/e/fund.general/?fy=2026#money-in",
    });
    expect(river.reserve).toMatchObject({ href: "/e/fund.general/?fy=2026#summary" });
    expect(river.uses.slice(0, -1).map((node) => node.value)).toEqual(
      [...river.uses.slice(0, -1).map((node) => node.value)].sort((a, b) => b - a),
    );
    expect(river.sources.every((node) => node.citation.sourceUrl && node.href !== null)).toBe(true);
    expect(river.uses.every((node) => node.citation.sourceUrl && node.href !== null)).toBe(true);

    const law = river.uses.find((node) => node.id === "opcat.law-enforcement");
    expect(law).toMatchObject({
      label: "Law Enforcement Services",
      value: 84_673_198,
      href: "/e/opcat.law-enforcement/?fy=2026",
      citation: { sourceCode: "FY2026", printedPage: 57, pdfPage: 58 },
    });
    expect(law?.description).toMatch(/Includes Sheriff, Coroner, and Medical Examiner/i);
    expect(river.coverageNote).toMatch(/department-view categories/i);
  });

  it("uses the broad overview only when the department partition is incomplete, and keeps historic statement links", () => {
    const river = getGeneralFundRiver(2022);

    expect(river).not.toBeNull();
    if (!river) return;
    expect(river.uses.some((node) => node.id === "overview.gf.law-enforcement")).toBe(true);
    expect(river.uses.some((node) => node.id === "opcat.law-enforcement")).toBe(false);
    expect(river.coverageNote).toMatch(/broad operating overview because the department-view category series is incomplete/i);
    expect(river.sources.at(-1)).toMatchObject({ href: "/e/fund.general/?fy=2022#money-in" });
    expect(river.uses.at(-1)).toMatchObject({ href: "/e/fund.general/?fy=2022#money-out" });
    expect(river.reserve).toMatchObject({ href: "/e/fund.general/?fy=2022#summary" });
  });

  it("uses only fully reconciled, cited partitions for every offered year", () => {
    for (const year of [2022, 2023, 2024, 2025, 2026, 2027]) {
      const river = getGeneralFundRiver(year);
      expect(river, `FY${year}`).not.toBeNull();
      if (!river) continue;
      expect(sum(river.uses)).toBe(river.authority);
      expect(river.uses.every((node) => node.value >= 0 && node.citation.sourceUrl.length > 0)).toBe(true);
    }
  });

  it("offers only years with complete source and service-category statements", () => {
    expect(getRiverYears()).toEqual([2022, 2023, 2024, 2025, 2026, 2027]);
    expect(getGeneralFundRiver(2017)).toBeNull();
    expect(getGeneralFundRiver(2021)).toBeNull();
  });

  it("keeps direct service links inside the published category for the selected year", () => {
    const current = getGeneralFundRiver(2026)!;
    const previous = getGeneralFundRiver(2025)!;
    const administration = current.uses.find((node) => node.id === "opcat.department-of-administration")!;
    expect(administration).toMatchObject({
      label: "EMS and county support",
      officialLabel: "Department of Administration",
      value: 44_035_256,
      context: { sources: [{ href: "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf#page=66" }] },
    });
    expect(administration.serviceExamples).toContainEqual(expect.objectContaining({
      id: "dept.emergencymedicalservices",
      label: "Ambulance services",
      officialLabel: "Emergency Medical Services",
      value: 32_783_093,
      href: "/e/dept.emergencymedicalservices/?fy=2026",
      citation: expect.objectContaining({ sourceCode: "FY2026", printedPage: 57, pdfPage: 58 }),
    }));
    expect(previous.uses.some((node) => node.id === administration.id)).toBe(false);
    expect(previous.uses.every((node) => !node.context && !node.officialLabel)).toBe(true);
    expect(previous.uses.find((node) => node.id === "opcat.strategic-operations")?.serviceExamples)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        id: "dept.emergencymedicalservices", href: "/e/dept.emergencymedicalservices/?fy=2025",
      })]));
    // The incomplete earlier department view cannot supply an implied crosswalk.
    expect(getGeneralFundRiver(2022)!.uses.every((node) => !node.serviceExamples)).toBe(true);
    for (const river of [current, previous]) {
      expect(sum(river.uses)).toBe(river.authority);
      for (const node of river.uses) {
        if (node.serviceExamples) expect(sum(node.serviceExamples)).toBeLessThanOrEqual(node.value);
      }
    }
  });
});
