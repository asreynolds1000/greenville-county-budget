import { describe, expect, it } from "vitest";

import { getSources } from "./loaders";
import { sourceCoversFiscalYear } from "./sourceYears";

describe("which years a source book covers", () => {
  it("covers both years of a two-year book", () => {
    expect(sourceCoversFiscalYear("FY2024-25", 2024)).toBe(true);
    expect(sourceCoversFiscalYear("FY2024-25", 2025)).toBe(true);
    expect(sourceCoversFiscalYear("FY2024-25", 2026)).toBe(false);
    expect(sourceCoversFiscalYear("FY2024-25", 2023)).toBe(false);
  });

  it("covers one year for a single-year book", () => {
    expect(sourceCoversFiscalYear("FY2026", 2026)).toBe(true);
    expect(sourceCoversFiscalYear("FY2026", 2025)).toBe(false);
  });

  it("treats a non-numeric qualifier as a single year", () => {
    expect(sourceCoversFiscalYear("FY2012-ACFR", 2012)).toBe(true);
    expect(sourceCoversFiscalYear("FY2012-ACFR", 2013)).toBe(false);
  });

  it("handles a century rollover in the two-digit tail", () => {
    expect(sourceCoversFiscalYear("FY2099-00", 2099)).toBe(true);
    // Not a real code, and the point of the assertion is that the arithmetic is stated
    // rather than accidental: a two-digit tail is read inside the start year's century.
    expect(sourceCoversFiscalYear("FY2099-00", 2000)).toBe(false);
  });

  it("parses every source code in the registry", () => {
    // The guard against a new naming convention landing in the data and being silently
    // treated as covering nothing, which would print "as printed in" on every row of
    // every page citing that book.
    for (const source of getSources()) {
      const match = /^FY(\d{4})/.exec(source.source_code);
      expect(match, `unparseable source code: ${source.source_code}`).not.toBeNull();
      const startYear = Number(match![1]);
      expect(
        sourceCoversFiscalYear(source.source_code, startYear),
        `${source.source_code} does not cover its own first year`,
      ).toBe(true);
    }
  });
});
