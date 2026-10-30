import { describe, expect, it } from "vitest";

import {
  calculatePropertyTax,
  propertyTaxDataSchema,
  taxData,
  type CalculatedPropertyTax,
  type PropertyTaxInput,
} from "./propertyTax";

function calculated(input: Parameters<typeof calculatePropertyTax>[0]): CalculatedPropertyTax {
  const result = calculatePropertyTax(input);
  if (result.kind !== "calculated") throw new Error(result.reason);
  return result;
}

function line(result: CalculatedPropertyTax, id: string) {
  const found = result.lines.find((item) => item.id === id);
  if (!found) throw new Error(`Missing allocation line ${id}`);
  return found;
}

describe("property-tax data contract", () => {
  it("accepts the generated 2025 source data", () => {
    expect(propertyTaxDataSchema.safeParse(taxData).success).toBe(true);
  });

  it("rejects a district whose published components do not add to the printed total", () => {
    const invalid = structuredClone(taxData);
    invalid.districts[0].totalMills += 0.1;
    expect(propertyTaxDataSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects county rows that do not match the sourced county component sum", () => {
    const invalid = structuredClone(taxData);
    invalid.districts[0].countyMills -= 0.1;
    expect(propertyTaxDataSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an unrecognized school system instead of silently applying Greenville's split", () => {
    const invalid = structuredClone(taxData);
    invalid.districts[0].schoolName = "Unverified" as never;
    expect(propertyTaxDataSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("2025 property-tax calculation", () => {
  it("matches the official district 065 4% non-Homestead oracle and does not count all county-column mills as county government", () => {
    const result = calculated({ districtCode: "065", taxableMarketValue: 100_000, assessmentRatio: 4, homestead: false });

    expect(result.assessedValue).toBe(4_000);
    expect(result.total).toBe(435.60);
    expect(result.countyTotal).toBe(190.80);
    expect(result.otherTotal).toBe(244.80);
    expect(result.schoolRelief).toBe(564.80);
    expect(line(result, "county-operations")).toMatchObject({ mills: 47.3, amount: 189.20, group: "county", sourcePage: 4 });
    expect(line(result, "county-debt")).toMatchObject({ mills: 0.4, amount: 1.60, group: "county", sourcePage: 4 });
    expect(line(result, "greenville-school-debt")).toMatchObject({ mills: 48.5, amount: 194, sourcePage: 4 });
    expect(result.lines.filter((item) => item.group === "county").reduce((sum, item) => sum + item.mills, 0)).toBeCloseTo(47.7, 8);
    expect(result.lines.some((item) => item.id === "school-operations")).toBe(false);
    expect(result.lines.some((item) => /fee|stormwater/i.test(item.label))).toBe(false);
  });

  it("matches the official 6% district 065 oracle without legal-residence school relief", () => {
    const result = calculated({ districtCode: "065", taxableMarketValue: 100_000, assessmentRatio: 6, homestead: false });

    expect(result.assessedValue).toBe(6_000);
    expect(result.total).toBe(1_500.60);
    expect(result.schoolRelief).toBe(0);
    expect(line(result, "school")).toMatchObject({ mills: 189.7, amount: 1_138.20 });
  });

  it("applies Homestead separately from the already-applied 4% school-operating relief", () => {
    const result = calculated({ districtCode: "065", taxableMarketValue: 100_000, assessmentRatio: 4, homestead: true });

    expect(result.taxableValueAfterHomestead).toBe(50_000);
    expect(result.assessedValue).toBe(2_000);
    expect(result.total).toBe(217.80);
    expect(result.countyTotal).toBe(95.40);
    expect(result.otherTotal).toBe(122.40);
    expect(result.schoolRelief).toBe(564.80);
  });

  it("keeps a cent-rounded total equal to its recipient lines", () => {
    const result = calculated({ districtCode: "500", taxableMarketValue: 123_456.78, assessmentRatio: 6, homestead: false });
    const lineTotal = result.lines.reduce((sum, item) => sum + item.amount, 0);

    expect(result.total).toBe(Math.round((lineTotal + Number.EPSILON) * 100) / 100);
    expect(result.total).toBeCloseTo(result.countyTotal + result.otherTotal, 8);
  });

  it("withholds 4% Anderson and Spartanburg estimates until school operations and debt are separately sourced", () => {
    for (const districtCode of ["025", "432"]) {
      expect(calculatePropertyTax({ districtCode, taxableMarketValue: 100_000, assessmentRatio: 4, homestead: false })).toMatchObject({
        kind: "unsupported",
        reason: expect.stringMatching(/does not separate.*operating and debt/i),
      });
    }
  });

  it("returns unsupported for incomplete, invalid, or legally incompatible inputs", () => {
    const invalidInputs: PropertyTaxInput[] = [
      { districtCode: "", taxableMarketValue: 1, assessmentRatio: 4, homestead: false },
      { districtCode: "999", taxableMarketValue: 1, assessmentRatio: 4, homestead: false },
      { districtCode: "065", taxableMarketValue: -1, assessmentRatio: 4, homestead: false },
      { districtCode: "065", taxableMarketValue: Number.NaN, assessmentRatio: 4, homestead: false },
      { districtCode: "065", taxableMarketValue: Number.POSITIVE_INFINITY, assessmentRatio: 4, homestead: false },
      { districtCode: "065", taxableMarketValue: 1_000_000_000_000.01, assessmentRatio: 4, homestead: false },
      { districtCode: "065", taxableMarketValue: 1, assessmentRatio: 6, homestead: true },
      { districtCode: "065", taxableMarketValue: 1, assessmentRatio: 5 as unknown as 4, homestead: false },
    ];

    for (const input of invalidInputs) expect(calculatePropertyTax(input)).toHaveProperty("kind", "unsupported");
  });
});
