import { expect, test } from "@playwright/test";

test("Administration explains that its FY2026 category includes EMS before history", async ({ page }) => {
  await page.goto("/e/opcat.department-of-administration/?fy=2026");

  const context = page.getByRole("complementary", { name: /what the fy2026 administration category covers/i });
  await expect(context).toContainText("Emergency Medical Services");
  await expect(context).toContainText("$32,783,093");
  await expect(context.getByRole("link", { name: /printed p\.65/i })).toBeVisible();

  const composition = page.getByRole("heading", { name: /what makes it up/i });
  const comparison = page.locator("#change-over-time");
  expect(await composition.evaluate((element) => (
    element.compareDocumentPosition(document.querySelector("#change-over-time")!)
      & Node.DOCUMENT_POSITION_FOLLOWING
  ))).toBeTruthy();
  await expect(comparison).toBeVisible();
});

test("road searches and road detail pages lead to a sourced, non-additive guide", async ({ page }) => {
  await page.goto("/search/?q=roads");
  await expect(page.getByRole("heading", { name: "How the separate road budgets relate" })).toBeVisible();
  await page.getByRole("link", { name: /open the roads explainer/i }).click();
  await expect(page).toHaveURL(/\/services\/roads\//);
  await expect(page.getByRole("main")).toContainText("must not be added together");

  await page.goto("/e/fund.sr.road-program/?fy=2026");
  await expect(page.getByRole("link", { name: /how the separate road budgets relate/i })).toBeVisible();
  await expect(page.getByText(/does not explain the full year-over-year increase/i)).toBeVisible();
});
