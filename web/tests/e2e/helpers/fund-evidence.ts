import { expect, type Page } from "@playwright/test";

// Pinned accounting evidence from source data, independently checked against the
// captured original panel markup. Deliberately outside the shared history/chart.
const budget2016 = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2016/budget_combined.pdf";
const budget2026 = "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf";
export const fundEvidence = {
  "fund.general": { totals: ["$140,193,909", "$242,740,106"], latest: "$288,494,094" },
  "fund.debt-service": { totals: ["$18,501,715", "$32,218,726"], latest: "$33,861,514",
    member: "balance.debt.beginning", values: ["$94,869", "$36,090,963"], pages: [50, 48] },
  "fund.special-revenue": { totals: ["$44,372,415", "$82,947,221"], latest: "$118,256,009",
    member: "balance.sr.beginning", values: ["$17,958,623", "$35,838,197"], pages: [46, 43] },
  "fund.enterprise": { totals: ["$22,003,332", "$28,457,302"], latest: "$35,296,480",
    member: "balance.enterprise.solid-waste-usage", values: ["-$197,534", "-$10,596,989"], pages: [149, 156] },
  "fund.internal-service": { totals: ["$35,408,142", "$48,356,039"], latest: "$58,943,086" },
} as const;
export type FundId = keyof typeof fundEvidence;

export function fundHeadline(page: Page, entityId: FundId) {
  return entityId === "fund.general"
    ? page.getByText("General Fund budget", { exact: true }).locator("..").locator("..")
    : page.locator("main > section").filter({ has: page.getByText("Authorized to spend", { exact: true }) });
}

export async function assertFundYear(page: Page, entityId: FundId, year: 2014 | 2024) {
  const index = year === 2014 ? 0 : 1;
  const evidence = fundEvidence[entityId];
  const source = year === 2014 ? budget2016 : budget2026;
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue(String(year));
  const headline = fundHeadline(page, entityId);
  await expect(headline.getByText(evidence.totals[index], { exact: true })).toBeVisible();
  await expect(headline).not.toContainText(evidence.latest);
  await expect(headline).not.toContainText(evidence.totals[index === 0 ? 1 : 0]);
  await expect(headline.locator(`a[href="${source}${entityId === "fund.general" ? `#page=${year === 2014 ? 37 : 36}` : ""}"]`)).toBeVisible();
  if (entityId === "fund.general") {
    const moneyOut = page.locator("#money-out");
    await expect(moneyOut).toContainText(year === 2014 ? "$136,750,125" : "$235,873,073");
    const actualSource = year === 2014
      ? "https://www.greenvillecounty.org/FinanceDivision/pdf_financial_report_2014/cafr_complete.pdf#page=39"
      : "https://www.greenvillecounty.org/FinanceDivision/PDFFinancialReport2024/CompleteACFR.pdf#page=39";
    await expect(moneyOut.locator(`a[href="${actualSource}"]`)).toBeVisible();
  } else if ("member" in evidence) {
    const row = page.locator('[data-coverage-domain="position"] li').filter({
      has: page.locator(`a[href^="/e/${evidence.member}"]`),
    });
    await expect(row.getByText(evidence.values[index], { exact: true })).toBeVisible();
    await expect(row.locator(`a[href="${source}"]`)).toBeVisible();
    await expect(row).toContainText(`p.${evidence.pages[index]}`);
    if (entityId === "fund.enterprise") await expect(page.locator('[data-coverage-domain="position"]')).toHaveAttribute("data-coverage-level", "partial");
  } else {
    await expect(page.locator('[data-coverage-domain="position"]')).toHaveAttribute("data-coverage-level", "unavailable");
    await expect(page.locator('[data-coverage-domain="position"]')).toContainText("has not been extracted from official sources");
  }
}
