import { expect, test } from "@playwright/test";

/**
 * The route consolidation dropped the fiscal year from every entity page title. The reviewed
 * baseline for the owner-approved page is "General Fund — FY2025 · Greenville County Budget
 * Explorer"; the consolidated route was serving "General Fund" for FY2002 through FY2026
 * alike. A page of FY2014 figures whose title says only "General Fund" is wrong in the tab,
 * in a bookmark, in the session-history entry the explorer pushes, and in a search result.
 *
 * These assertions have to run in a browser. The title for a non-latest year is set after
 * hydration, and the first repair attempt — a plain effect — passed every unit test while
 * losing a race it could not see: the framework re-applies its own server-rendered title when
 * a deferred fund panel resolves, about 300ms later. Only a real page shows that.
 */
test.describe("entity page titles name the year on screen", () => {
  test("a deferred fund's historical year keeps its title after the panel resolves", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2025");
    await expect(page.getByRole("heading", { name: "How the General Fund moves through one year" })).toBeVisible();
    await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2025");

    await expect(page).toHaveTitle("General Fund — FY2025 · Greenville County Budget Explorer");
    // The panel's own request settles around 300ms in and re-applies the metadata title. A
    // title that is only correct before then is the defect, not the fix.
    await page.waitForTimeout(1500);
    await expect(page).toHaveTitle("General Fund — FY2025 · Greenville County Budget Explorer");
  });

  test("the latest year is named too, and the title follows the year control", async ({ page }) => {
    await page.goto("/e/fund.general/");
    await expect(page).toHaveTitle("General Fund — FY2026 · Greenville County Budget Explorer");

    await page.getByRole("combobox", { name: "Explore fiscal year" }).selectOption("2014");
    await expect(page).toHaveTitle("General Fund — FY2014 · Greenville County Budget Explorer");

    await page.goBack();
    await expect(page).toHaveTitle("General Fund — FY2026 · Greenville County Budget Explorer");
  });

  test("an ordinary entity page names its year without any deferred panel", async ({ page }) => {
    await page.goto("/e/rev.sr.fees/?fy=2025");
    await expect(page).toHaveTitle("Special Revenue Fees — FY2025 · Greenville County Budget Explorer");
  });

  test("an uncovered year leaves the title alone rather than asserting a year it is not showing", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=1999");
    await expect(page.getByRole("heading", { name: "Fiscal year unavailable" })).toBeVisible();
    await expect(page).not.toHaveTitle(/FY1999/);
  });
});
