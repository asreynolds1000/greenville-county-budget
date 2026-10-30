import { expect, test } from "@playwright/test";

test.describe("General Fund final-amended-budget presentation", () => {
  test("shows FY2011 final totals, transfers, and the audited statement source", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e/fund.general/?fy=2011");

    const moneyIn = page.locator("#money-in");
    await expect(moneyIn).toContainText("Final amended budget");
    await expect(moneyIn).toContainText("$125,420,953");
    await expect(moneyIn).toContainText("$7,248,480");
    await expect(moneyIn).toContainText("$132,669,433");
    await expect(moneyIn.getByRole("link", { name: "FY2011-ACFR, p.28", exact: true })).toHaveAttribute("href", /#page=42$/);

    const moneyOut = page.locator("#money-out");
    await expect(moneyOut).toContainText("$126,719,519");
    await expect(moneyOut).toContainText("$5,913,769");
    await expect(moneyOut).toContainText("$132,633,288");
    const mobileBudgetValue = moneyIn.locator('[data-label="Final amended budget"]').first();
    await expect(mobileBudgetValue).toBeVisible();
    await expect(mobileBudgetValue).toHaveAttribute("data-label", "Final amended budget");
    expect(await mobileBudgetValue.evaluate((element) => (
      getComputedStyle(element, "::before").content
    ))).toContain("Final amended budget");
    await expect(page.getByText("Fund balance appropriation (final budget)", { exact: true })).toBeVisible();
    await expect(page.getByText(/remaining \$36,145 is a line the audited report prints/i)).toBeVisible();
  });

  test("separates the final-budget comparison from the budget-book position forecast", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2018");

    await expect(page.getByText("FY2018 budget-book plan", { exact: true })).toBeVisible();
    await expect(page.getByText(/separate from the adopted budget-book plan/i)).toBeVisible();
    await expect(page.getByText("Change in fund balance", { exact: true })).toBeVisible();
    await expect(page.getByText("Final amended budget", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Download final-budget totals and actuals (CSV)" }))
      .toHaveAttribute("href", "/downloads/comparisons/general-fund-totals-budget-actual.csv");
  });

  test("shows FY2022's signed budget-book position adjustment in the ending-balance bridge", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e/fund.general/?fy=2022");

    await expect(page.getByText("Budget-book-only adjustment", { exact: true })).toBeVisible();
    await expect(page.locator(".forecast-bridge-equation").getByText("$31,425,244", { exact: true })).toBeVisible();
    await expect(page.locator(".forecast-bridge-equation > b[aria-label=\"minus\"]")).toBeVisible();
    await expect(page.getByText("Actual ending balance", { exact: true })).toBeVisible();
  });

  test("keeps FY2017's negative accounting-basis operator visible on phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e/fund.general/?fy=2017");

    await expect(page.getByText("Accounting-basis adjustment (Budget-to-GAAP)", { exact: true })).toBeVisible();
    await expect(page.locator(".forecast-bridge-equation > b[aria-label=\"minus\"]")).toBeVisible();
  });
});

test("links a source-backed General Fund service bar to its exact fiscal-year detail", async ({ page }) => {
  await page.goto("/e/fund.general/?fy=2026");

  const service = page.getByRole("link", { name: "Explore Administrative Services, FY2026", exact: true });
  await expect(service).toHaveAttribute("href", "/e/overview.gf.administrative/?fy=2026");
  await service.click();
  await expect(page).toHaveURL(/\/e\/overview\.gf\.administrative\/\?fy=2026$/);
});

test.describe("mobile fiscal-year routing", () => {
  test("offers grouped coverage labels and routes every selected year", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e/fund.general/?fy=2026");

    const select = page.getByRole("combobox", { name: "Choose fiscal year" });
    await expect(select).toBeVisible();
    await expect(select).toHaveValue("2026");
    await expect(select.locator("optgroup")).toHaveCount(3);
    await expect(select.locator("optgroup").nth(0)).toHaveAttribute("label", "Complete budget loop");
    await expect(select.locator("optgroup").nth(1)).toHaveAttribute("label", "Budget and audited comparison");
    await expect(select.locator("optgroup").nth(2)).toHaveAttribute("label", "Partial historical record");

    await select.selectOption("2017");
    await expect(page).toHaveURL(/\/e\/fund\.general\/\?fy=2017$/);
    await expect(page.getByRole("heading", { name: "How the General Fund moves through one year" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Choose fiscal year" })).toHaveValue("2017");
  });

  test("keeps the desktop grouped year links and labels the anchor navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/e/fund.general/?fy=2026");

    await expect(page.getByRole("navigation", { name: "Fiscal year" }).getByRole("link", { name: "FY2026" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Choose fiscal year" })).toBeHidden();
  });
});
