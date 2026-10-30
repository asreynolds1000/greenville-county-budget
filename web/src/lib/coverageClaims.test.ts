import { describe, expect, it } from "vitest";

import {
  COVERAGE_CLAIMS,
  EARLY_YEAR_CLAIMS,
  coveredInflowClaimText,
  earlyYearClaimText,
  uncoveredClaimText,
} from "./coverageClaims";
import {
  getCoverage,
  getGeneralFundComparisonYears,
  getV2EntityPage,
  getVerification,
} from "./loaders";

function years(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

describe("hand-authored trust-page coverage claims", () => {
  it("agrees with coverage.json at every boundary and published year", () => {
    const coverage = getCoverage();

    for (const claim of COVERAGE_CLAIMS) {
      const claimDescription = JSON.stringify(claim);
      for (const check of claim.checks) {
        const rows = coverage
          .filter(
            (row) => row.scope_entity_id === check.scope && row.domain === check.domain,
          )
          .sort((a, b) => a.fiscal_year - b.fiscal_year);
        expect(rows.length, claimDescription).toBeGreaterThan(0);

        for (const row of rows) {
          if (claim.kind === "complete_from") {
            const expected = row.fiscal_year < claim.fiscalYear ? "unavailable" : "complete";
            expect(row.coverage_level, `${claimDescription}; FY${row.fiscal_year}`).toBe(expected);
          } else {
            expect(row.coverage_level, `${claimDescription}; FY${row.fiscal_year}`)
              .toBe("unavailable");
          }
        }
      }
    }
  });

  it("agrees with the data products present and absent in FY2006–FY2010", () => {
    const comparisonYears = new Set(getGeneralFundComparisonYears());
    const verificationYears = new Set(getVerification().map((row) => row.fiscal_year));

    for (const claim of EARLY_YEAR_CLAIMS) {
      const claimDescription = JSON.stringify(claim);
      for (const fiscalYear of years(claim.fiscalYearStart, claim.fiscalYearEnd)) {
        if (claim.kind === "comparison_absent") {
          expect(comparisonYears.has(fiscalYear), claimDescription).toBe(false);
        } else if (claim.kind === "verification_absent") {
          expect(verificationYears.has(fiscalYear), claimDescription).toBe(false);
        } else {
          for (const entityId of claim.entityIds) {
            const points = getV2EntityPage(entityId).series.filter(
              (point) => point.fiscal_year === fiscalYear && point.value !== null,
            );
            expect(points.length, `${claimDescription}; ${entityId}/FY${fiscalYear}`)
              .toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("renders every checked claim into the shared trust-page copy", () => {
    const prose = [coveredInflowClaimText(), uncoveredClaimText(), earlyYearClaimText()].join(" ");
    for (const claim of [...COVERAGE_CLAIMS, ...EARLY_YEAR_CLAIMS]) {
      expect(prose, JSON.stringify(claim)).toContain(claim.label);
    }
  });
});
