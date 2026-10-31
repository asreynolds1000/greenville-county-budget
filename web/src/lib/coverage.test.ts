import { describe, expect, it } from "vitest";

import { getCoverage, getCoverageState } from "./loaders";

/**
 * The county overview's exit gate, tested where it can be tested: a reader must not be able
 * to mistake General Fund revenue for county revenue. In the browser that is a judgement
 * about a rendering; here it is the two structural facts the rendering rests on — that the
 * claim exists for every region, and that it says the right thing.
 */
describe("coverage states", () => {
  const OVERVIEW_SCOPES = [
    "budget.total",
    "fund.general",
    "fund.special-revenue",
    "fund.debt-service",
    "fund.enterprise",
    "fund.internal-service",
  ];

  it("exists for every overview region in every published year", () => {
    for (const scope of OVERVIEW_SCOPES) {
      for (const domain of ["inflow", "position", "outflow"] as const) {
        for (let year = 2002; year <= 2027; year++) {
          expect(
            () => getCoverageState(scope, domain, year),
            `${scope}/${domain}/FY${year}`,
          ).not.toThrow();
        }
      }
    }
  });

  it("refuses to invent a state it does not have", () => {
    // The page would otherwise render a region with no number and no explanation, which
    // reads as "there is nothing here" rather than "we have not extracted this".
    expect(() => getCoverageState("fund.general", "inflow", 1999)).toThrow(/No coverage state/);
  });

  it("keeps countywide inflow partial while naming the extracted fund ranges", () => {
    // The countywide claim stays partial because Internal Service inflow is not covered.
    // The three extracted non-General-Fund statements must move only at their source-backed
    // boundaries; this prevents either regressing the new coverage or backfilling years the
    // county did not publish in a comparable statement.
    for (let year = 2002; year <= 2027; year++) {
      expect(getCoverageState("budget.total", "inflow", year).coverage_level).toBe("partial");
    }

    for (const scope of ["fund.special-revenue", "fund.debt-service"]) {
      for (let year = 2002; year <= 2009; year++) {
        expect(getCoverageState(scope, "inflow", year).coverage_level).toBe("unavailable");
      }
      for (let year = 2010; year <= 2027; year++) {
        expect(getCoverageState(scope, "inflow", year).coverage_level).toBe("complete");
      }
    }

    for (let year = 2002; year <= 2027; year++) {
      expect(getCoverageState("fund.enterprise", "inflow", year).coverage_level).toBe("complete");
      expect(getCoverageState("fund.internal-service", "inflow", year).coverage_level)
        .toBe("unavailable");
    }
  });

  it("gives every state words, not just a level", () => {
    // A level alone is a colour and a badge. What a resident needs is the sentence, and an
    // `unavailable` region with no note is exactly the empty region this step exists to
    // remove — so the note matters most precisely where there is no number.
    for (const state of getCoverage()) {
      expect(state.gap_note, `${state.scope_entity_id}/${state.domain}/FY${state.fiscal_year}`)
        .toBeTruthy();
    }
  });
});
