import { describe, expect, it } from "vitest";

import { isV2FiscalYearCovered } from "./loaders";

describe("isV2FiscalYearCovered", () => {
  it("accepts a fiscal year covered by the entity series", () => {
    expect(isV2FiscalYearCovered("fund.general", 2026)).toBe(true);
  });

  it("rejects a summary component with no same-year entity observation", () => {
    // The FY2018 General Fund overview names Public Works, while the individual Public
    // Works accounting page does not have an FY2018 observation. The overview figure is
    // useful and stays visible; only the nonexistent detail URL must not be linked.
    expect(isV2FiscalYearCovered("overview.gf.public-works", 2018)).toBe(false);
  });

  it("rejects an unknown entity", () => {
    expect(isV2FiscalYearCovered("does.not.exist", 2026)).toBe(false);
  });
});
