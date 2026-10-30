import { describe, expect, it } from "vitest";

import { getGeneralFundShareContext } from "./generalFundShare";
import { getSpendingComparisonData } from "./spendingSnapshots";
import { formatShare, shareOfTotal } from "./shares";

/**
 * `/compare/` (SpendingComparison.tsx) computes a row's share inline as
 * `row.end.value / end.total * 100`, formatted with `.toFixed(1)`, and withholds it whenever
 * `end.total !== end.detailTotal` (see the component's `sharesSupported`). That component is
 * out of scope for this change (napkin: "do NOT edit ... SpendingComparison.tsx"), so this
 * replicates its exact formula against the SAME data it reads (getSpendingComparisonData),
 * rather than importing anything from the component itself.
 */
function compareShareFor(
  year: number,
  kind: "categories" | "departments",
  id: string,
): { supported: boolean; share: number | null } {
  const { snapshots } = getSpendingComparisonData();
  const snapshot = snapshots.find((s) => s.year === year);
  if (!snapshot) throw new Error(`no /compare/ snapshot for FY${year}`);
  const supported =
    snapshot.total !== null && snapshot.detailTotal === snapshot.total;
  const line = snapshot[kind].find((row) => row.id === id);
  if (
    !supported ||
    line?.value == null ||
    snapshot.total === null ||
    snapshot.total <= 0
  ) {
    return { supported, share: null };
  }
  return { supported, share: (line.value / snapshot.total) * 100 };
}

describe("General Fund entity-page shares agree with /compare/", () => {
  it("FY2026 Law Enforcement Services share matches /compare/'s category share exactly", () => {
    const compare = compareShareFor(
      2026,
      "categories",
      "opcat.law-enforcement",
    );
    expect(compare.supported).toBe(true);
    expect(compare.share).not.toBeNull();

    const context = getGeneralFundShareContext(2026);
    expect(context.supported).toBe(true);
    expect(context.fundTotal).toBe(275_141_134);

    // 84,673,198 is the same published FY2026 Law Enforcement Services amount
    // getSpendingComparisonData() reads for this same category on this same fiscal year.
    const share = shareOfTotal(84_673_198, context.fundTotal!);
    expect(share).not.toBeNull();

    expect(share).toBeCloseTo(compare.share!, 9);
    expect(formatShare(share!)).toBe(formatShare(compare.share!));
    expect(formatShare(share!)).toBe("30.8%");
  });

  it("FY2026 Sheriff (department-level) share matches /compare/'s department share exactly", () => {
    // Same fixed value resident-comparisons.spec.ts asserts /compare/ shows for Sheriff.
    const compare = compareShareFor(2026, "departments", "dept.sheriff");
    expect(compare.supported).toBe(true);

    const context = getGeneralFundShareContext(2026);
    const share = shareOfTotal(80_407_123, context.fundTotal!);

    expect(share).toBeCloseTo(compare.share!, 9);
    expect(formatShare(share!)).toBe(formatShare(compare.share!));
    expect(formatShare(share!)).toBe("29.2%");
  });

  it("withholds FY2014 exactly where /compare/ withholds it: the detail hierarchy total diverges from the fund total", () => {
    const compare = compareShareFor(
      2014,
      "categories",
      "opcat.law-enforcement",
    );
    expect(compare.supported).toBe(false);
    expect(compare.share).toBeNull();

    const context = getGeneralFundShareContext(2014);
    expect(context.supported).toBe(false);
    expect(context.fundTotal).toBe(140_193_909);
    expect(context.detailTotal).toBe(140_195_909);
  });

  it("supports FY2025, where the detail hierarchy total equals the fund total", () => {
    const compare = compareShareFor(
      2025,
      "categories",
      "opcat.law-enforcement",
    );
    expect(compare.supported).toBe(true);

    const context = getGeneralFundShareContext(2025);
    expect(context.supported).toBe(true);
    expect(context.fundTotal).toBe(context.detailTotal);
  });

  it("returns unsupported with null totals for a fiscal year with no published fund total", () => {
    const context = getGeneralFundShareContext(1999);
    expect(context.supported).toBe(false);
    expect(context.fundTotal).toBeNull();
  });
});
