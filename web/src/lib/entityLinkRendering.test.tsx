import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntityYearLink } from "@/components/EntityYearLink";
import { FundEntityYearLink } from "@/components/FundEntityYearLink";

describe("canonical entity directory links", () => {
  for (const id of ["dept.sheriff", "fund.general", "opcat.law-enforcement", "dept.emergencymedicalservices"]) {
    it(`preserves ${id}'s directory slash in rendered HTML`, () => {
      const html = renderToStaticMarkup(<EntityYearLink entityId={id} fiscalYear={2026}>Details</EntityYearLink>);
      expect(html).toContain(`href="/e/${id}/?fy=2026"`);
    });
  }
  it("preserves the same contract in client fund links", () => {
    const html = renderToStaticMarkup(<FundEntityYearLink entityId="dept.sheriff" fiscalYear={2024}
      common={{ entities: {}, sources: {}, coveredYears: { "dept.sheriff": [2024] } }}>Details</FundEntityYearLink>);
    expect(html).toContain('href="/e/dept.sheriff/?fy=2024"');
  });
});
