import { expect, test } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`a resident compares the county total over ten years at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("link", { name: "How has the budget changed?" }).click();
    const section = page.locator("#change-over-time");
    await section.getByRole("combobox", { name: "Earlier year", exact: true }).selectOption("2016");
    await expect(section).toContainText("$256,805,216");
    await expect(section).toContainText("$477,233,755");
    await expect(section).toContainText("$220,428,539");
    await expect(section).toContainText("+85.8%");
    await expect(section).toContainText("not adjusted for inflation or population");
    const chart = section.getByRole("img");
    await expect(chart).toHaveAttribute("aria-label", /2016.*2026/);
    await expect(section.getByRole("link", { name: /download.*csv/i })).toBeVisible();
    await section.getByRole("combobox", { name: "Later year", exact: true }).selectOption("2025");
    await expect(section.getByRole("combobox", { name: "Earlier year", exact: true })).toHaveValue("2016");
    await expect(chart).toHaveAttribute("aria-label", /2016.*2025/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test(`a resident finds the largest department increase at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/compare/");
    await page.getByRole("combobox", { name: "Compare", exact: true }).selectOption("departments");
    await page.getByRole("combobox", { name: "Order by", exact: true }).selectOption("increase");
    const sheriff = page.getByTestId("spending-comparison-row").filter({ has: page.getByRole("heading", { name: "Sheriff", exact: true }) });
    await expect(sheriff).toContainText("$80,407,123");
    await expect(sheriff).toContainText("+$9,492,668");
    await expect(sheriff).toContainText("+13.4%");
    await expect(sheriff).toContainText("29.2% of the FY2026 General Fund budget");
    await expect(page.getByRole("main")).toContainText("not a share of all county spending");
    await sheriff.getByRole("link", { name: "$80,407,123", exact: true }).click();
    await expect(page).toHaveURL(/\/e\/dept.sheriff\/\?fy=2026/);
    await expect(page.getByRole("heading", { name: "What the FY2026 Sheriff budget covers" })).toBeVisible();
  });
}

test("reorganization endpoints remain inspectable without a false growth claim", async ({ page }) => {
  await page.goto("/e/dept.engineering/?fy=2016");
  const section = page.locator("#change-over-time");
  await section.getByRole("combobox", { name: "Earlier year", exact: true }).selectOption("2015");
  await expect(section).toContainText("$970,760");
  await expect(section).toContainText("$5,586,265");
  await expect(section).toContainText("No growth calculation is shown across this boundary");
  await expect(section).toContainText("Engineering absorbed its two bureaus");
});

test("compare defaults to individual departments, not aggregate categories", async ({ page }) => {
  await page.goto("/compare/");
  await expect(page.getByRole("combobox", { name: "Compare", exact: true })).toHaveValue("departments");
  await expect(page.getByTestId("spending-comparison-row").filter({ has: page.getByRole("heading", { name: "Sheriff", exact: true }) })).toBeVisible();
});

test("category comparisons withhold a false cut at the FY2024 regrouping", async ({ page }) => {
  await page.goto("/compare/");
  // The export is static and React hydrates after paint; a select changed before the
  // handler is attached is silently reset to state, which is how this test lost its row
  // on a slow CI runner. Re-select until a categories-only row proves the mode took.
  await expect(async () => {
    await page.getByRole("combobox", { name: "Compare", exact: true }).selectOption("categories");
    await expect(page.getByTestId("spending-comparison-row").filter({ hasText: "Community Planning and Development" })).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("combobox", { name: "From fiscal year", exact: true }).selectOption("2023");
  await page.getByRole("combobox", { name: "To fiscal year", exact: true }).selectOption("2024");
  const row = page.getByTestId("spending-comparison-row").filter({ hasText: "Community Planning and Development" });
  await expect(row).toContainText("Not comparable");
  const banner = page.getByTestId("regrouping-banner");
  await expect(banner).toContainText("Departments were regrouped in FY2024");
  await expect(banner).toContainText("longest comparable window");
});

test("the regrouping banner replaces the wall of identical explainers and can reach a clean window", async ({ page }) => {
  await page.goto("/compare/");
  await page.getByRole("combobox", { name: "From fiscal year", exact: true }).selectOption("2021");
  await page.getByRole("combobox", { name: "To fiscal year", exact: true }).selectOption("2026");
  await expect(page.getByText("Why no change is calculated")).toHaveCount(0);
  const banner = page.getByTestId("regrouping-banner");
  await expect(banner).toContainText("Departments were regrouped in FY2024");
  await expect(banner).toContainText("FY2024–FY2026");
  await banner.getByRole("button", { name: /Compare FY2024.*instead/ }).click();
  await expect(page.getByRole("combobox", { name: "From fiscal year", exact: true })).toHaveValue("2024");
  await expect(page.getByTestId("regrouping-banner")).toHaveCount(0);
});

test("a public transit search identifies its limitation without a false bus result", async ({ page }) => {
  await page.goto("/search/?q=bus");
  const main = page.getByRole("main");
  await expect(main).toContainText("Public transit and GreenLink");
  await expect(main).toContainText("not transit alone");
  await expect(main).not.toContainText("Enterprise Fund");
  await expect(main.getByRole("link", { name: /Outside Agencies/ })).toBeVisible();
});
