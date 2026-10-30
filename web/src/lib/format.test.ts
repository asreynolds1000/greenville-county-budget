import { describe, expect, it } from "vitest";

import { describeSourceCode, formatAmount } from "./format";

describe("formatAmount", () => {
  it("renders null as 'not published', never as $0", () => {
    expect(formatAmount(null)).toBe("not published");
  });

  it("renders a real published zero as '$0', never as unpublished", () => {
    expect(formatAmount(0)).toBe("$0");
  });

  it("renders a positive amount as US currency with no decimals", () => {
    expect(formatAmount(80407123)).toBe("$80,407,123");
  });

  it("renders a negative amount as signed currency (no data in this dataset is negative today, but the formatter must not assume non-negative input)", () => {
    expect(formatAmount(-5)).toBe("-$5");
  });
});

describe("describeSourceCode", () => {
  it("spells out the ACFR qualifier on an audited-report code", () => {
    expect(describeSourceCode("FY2025-ACFR")).toBe("FY2025 audited financial report (ACFR)");
  });

  it("leaves a plain single-year budget-book code unchanged", () => {
    expect(describeSourceCode("FY2026")).toBe("FY2026");
  });

  it("leaves a two-year budget-book code unchanged", () => {
    expect(describeSourceCode("FY2024-25")).toBe("FY2024-25");
  });
});
