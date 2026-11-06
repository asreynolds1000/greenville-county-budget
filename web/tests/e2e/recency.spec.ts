import { expect, test } from "@playwright/test";
import { fundHeadline } from "./helpers/fund-evidence";

for (const route of ["/", "/methodology/"]) {
  test(`the resolved FY2027 source removes the pending notice on ${route}`, async ({ page }) => {
    await page.goto(route);
    const notice = page.locator('[data-recency-notice="true"]');
    await expect(notice).toHaveCount(0);
    await expect(page.locator("footer")).toContainText(/Budget status checked October 30, 2026 · Data version [a-f0-9]{12}/);
  });
}

test("the homepage opens the final FY2027 General Fund and its source", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByText("County-published FY2027 budget total, including transfers between funds")).toBeVisible();
  await page.getByRole("link", { name: "Explore the FY2027 General Fund" }).click();
  await expect(page).toHaveURL(/\/e\/fund.general\/\?fy=2027$/);
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2027");
  await expect(fundHeadline(page, "fund.general")).toContainText("$288,494,094");
  await expect(fundHeadline(page, "fund.general").locator('a[href="https://www.greenvillecounty.org/ManagementandBudget/pdf/2027/BudgetCombined.pdf#page=36"]')).toBeVisible();
});
