import type { CoverageDomain } from "./schema";

/**
 * Hand-authored coverage claims used by the trust pages.
 *
 * These are intentionally not generated from coverage.json. The prose and the data must
 * remain independent implementations so the tests can make them disagree. Rendering the
 * prose from this list keeps a coverage assertion from being copied into two components
 * and going stale in only one of them.
 */
export type CoverageClaim =
  | {
      id: string;
      kind: "complete_from";
      label: string;
      fiscalYear: number;
      checks: { scope: string; domain: CoverageDomain }[];
    }
  | {
      id: string;
      kind: "unavailable_all_published_years";
      label: string;
      checks: { scope: string; domain: CoverageDomain }[];
    };

export const COVERAGE_CLAIMS: CoverageClaim[] = [
  {
    id: "special-revenue-and-debt-service-inflow",
    kind: "complete_from",
    label: "Special Revenue and Debt Service money-in summaries",
    fiscalYear: 2010,
    checks: [
      { scope: "fund.special-revenue", domain: "inflow" },
      { scope: "fund.debt-service", domain: "inflow" },
    ],
  },
  {
    id: "enterprise-inflow",
    kind: "complete_from",
    label: "Enterprise money-in summaries",
    fiscalYear: 2002,
    checks: [{ scope: "fund.enterprise", domain: "inflow" }],
  },
  {
    id: "internal-service-inflow-and-position",
    kind: "unavailable_all_published_years",
    label: "Internal Service Fund money in and fund position",
    checks: [
      { scope: "fund.internal-service", domain: "inflow" },
      { scope: "fund.internal-service", domain: "position" },
    ],
  },
];

export type EarlyYearClaim =
  | {
      id: string;
      kind: "entity_series_present";
      label: string;
      fiscalYearStart: number;
      fiscalYearEnd: number;
      entityIds: string[];
    }
  | {
      id: string;
      kind: "comparison_absent";
      label: string;
      fiscalYearStart: number;
      fiscalYearEnd: number;
    }
  | {
      id: string;
      kind: "verification_absent";
      label: string;
      fiscalYearStart: number;
      fiscalYearEnd: number;
    };

export const EARLY_YEAR_CLAIMS: EarlyYearClaim[] = [
  {
    id: "adopted-budget-series-present-fy2006-fy2010",
    kind: "entity_series_present",
    label: "adopted fund totals and department-level series",
    fiscalYearStart: 2006,
    fiscalYearEnd: 2010,
    // One aggregate and one department make the two levels in the prose independently
    // falsifiable. The test checks every year in the range, not just the endpoints.
    entityIds: ["fund.general", "dept.sheriff"],
  },
  {
    id: "audited-comparison-absent-fy2006-fy2010",
    kind: "comparison_absent",
    label: "audited budget-versus-actual comparison",
    fiscalYearStart: 2006,
    fiscalYearEnd: 2010,
  },
  {
    id: "fidelity-audit-absent-fy2006-fy2010",
    kind: "verification_absent",
    label: "source-fidelity audit",
    fiscalYearStart: 2006,
    fiscalYearEnd: 2010,
  },
];

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function coveredInflowClaimText(): string {
  const claims = COVERAGE_CLAIMS.filter((claim) => claim.kind === "complete_from");
  return joinLabels(claims.map((claim) => `${claim.label} from FY${claim.fiscalYear}`));
}

export function uncoveredClaimText(): string {
  return joinLabels(
    COVERAGE_CLAIMS
      .filter((claim) => claim.kind === "unavailable_all_published_years")
      .map((claim) => claim.label),
  );
}

export function earlyYearClaimText(): string {
  const present = EARLY_YEAR_CLAIMS.find((claim) => claim.kind === "entity_series_present");
  const absent = EARLY_YEAR_CLAIMS.filter(
    (claim) => claim.kind === "comparison_absent" || claim.kind === "verification_absent",
  );
  if (!present || absent.length === 0) {
    throw new Error("The FY2006–FY2010 trust-page claims are incomplete");
  }
  return `FY${present.fiscalYearStart}–FY${present.fiscalYearEnd} are included in the ${present.label}. `
    + `They are outside the ${joinLabels(absent.map((claim) => claim.label))}.`;
}
