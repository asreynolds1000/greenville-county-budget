import { describe, expect, it } from "vitest";

import { allocateShares, formatShare, shareOfTotal } from "./shares";

/** Sum shares as integer tenths-of-a-percent to avoid float-noise flakiness. */
function sumAsTenths(shares: { share: number }[]): number {
  return shares.reduce((sum, s) => sum + Math.round(s.share * 10), 0);
}

describe("allocateShares (Hamilton / largest-remainder)", () => {
  it("fixes the FY2026 four-fund naive-rounding overshoot to exactly 100.0", () => {
    // Naive per-item rounding: 57.7 + 28.1 + 7.3 + 7.0 = 100.1 (the bug this
    // function exists to fix — plan review Y2).
    const result = allocateShares([
      { id: "fund.general", value: 275_141_134 },
      { id: "fund.special-revenue", value: 133_984_290 },
      { id: "fund.debt-service", value: 34_885_734 },
      { id: "fund.enterprise", value: 33_222_597 },
    ]);
    const byId = Object.fromEntries(result.map((r) => [r.id, r.share]));

    expect(byId["fund.general"]).toBeCloseTo(57.6, 5);
    expect(byId["fund.special-revenue"]).toBeCloseTo(28.1, 5);
    expect(byId["fund.debt-service"]).toBeCloseTo(7.3, 5);
    expect(byId["fund.enterprise"]).toBeCloseTo(7.0, 5);
    expect(sumAsTenths(result)).toBe(1000); // 100.0%
  });

  it("always sums to exactly 100.0 for arbitrary positive values, including adversarial splits", () => {
    const cases: number[][] = [
      [1, 1, 1],
      [10, 20, 30, 5],
      [3, 3, 3, 3, 3, 3, 3], // 7-way even split — naive rounding drifts here too
      [999_983, 7, 5, 5],
      [1], // single item
    ];
    for (const values of cases) {
      const result = allocateShares(values.map((value, idx) => ({ id: String(idx), value })));
      expect(sumAsTenths(result)).toBe(1000);
    }
  });

  it("allocates 100.0 to a single input", () => {
    expect(allocateShares([{ id: "only", value: 42 }])).toEqual([{ id: "only", share: 100 }]);
  });

  it("gives every share either floor(exact) or floor(exact) + 1 — never further off", () => {
    const values = [7, 11, 13, 17, 19];
    const total = values.reduce((a, b) => a + b, 0);
    const result = allocateShares(values.map((value, idx) => ({ id: String(idx), value })));
    result.forEach((r, idx) => {
      const exact = (values[idx] / total) * 100;
      expect(r.share).toBeGreaterThanOrEqual(Math.floor(exact * 10) / 10);
      expect(r.share).toBeLessThanOrEqual(Math.floor(exact * 10) / 10 + 0.1 + 1e-9);
    });
  });

  it("returns all-zero shares when total is zero — no fabricated proportion", () => {
    const result = allocateShares([
      { id: "a", value: 0 },
      { id: "b", value: 0 },
    ]);
    expect(result).toEqual([
      { id: "a", share: 0 },
      { id: "b", share: 0 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(allocateShares([])).toEqual([]);
  });

  it("respects a 0-decimal precision and still sums to exactly 100", () => {
    const result = allocateShares(
      [
        { id: "a", value: 1 },
        { id: "b", value: 1 },
        { id: "c", value: 1 },
      ],
      0,
    );
    expect(result.reduce((sum, r) => sum + r.share, 0)).toBe(100);
  });
});

describe("formatShare", () => {
  it("formats to one decimal by default with a percent sign", () => {
    expect(formatShare(57.6)).toBe("57.6%");
  });

  it("respects a custom decimals argument", () => {
    expect(formatShare(57.62, 2)).toBe("57.62%");
    expect(formatShare(58, 0)).toBe("58%");
  });
});

describe("shareOfTotal", () => {
  it("computes the same value /compare/'s inline `value / total * 100` would", () => {
    // FY2026 Law Enforcement Services against the FY2026 General Fund total (see
    // generalFundShare.test.ts for the cross-check against the /compare/ data path itself).
    expect(shareOfTotal(84_673_198, 275_141_134)).toBeCloseTo(30.774459917723533, 12);
  });

  it("returns null rather than Infinity/NaN when there is nothing to divide by", () => {
    expect(shareOfTotal(100, 0)).toBeNull();
    expect(shareOfTotal(100, -5)).toBeNull();
  });

  it("is a plain ratio, unlike allocateShares -- it does not require its peers to sum to 100", () => {
    // A department's share of the whole fund total, where the fund total is not the sum of
    // the visible list (it also includes transfers a filtered department list may omit).
    const departmentShare = shareOfTotal(80_407_123, 275_141_134)!;
    const anotherDepartmentShare = shareOfTotal(32_783_093, 275_141_134)!;
    expect(departmentShare + anotherDepartmentShare).toBeLessThan(100);
  });
});
