import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("parks search explains the overlap and preserves all three official accounting entries", async ({ page }) => {
  await page.goto("/search/?q=parks");
  const results = page.getByTestId("search-result");
  await expect(results).toHaveCount(3);
  const whole = results.filter({ has: page.locator('a[href^="/e/fund.sr.parks-recreation-tourism"]') });
  const spending = results.filter({ has: page.locator('a[href^="/e/use.sr.parks-recreation-tourism"]') });
  const debt = results.filter({ has: page.locator('a[href^="/e/use.debt.parks-recreation-tourism"]') });
  // Search previews the latest year (FY2027); the explainer below is the FY2026 plan.
  await expect(whole).toContainText("FY2027");
  await expect(whole).toContainText("$22,025,613");
  await expect(spending).toContainText("$17,840,529");
  await expect(spending).toContainText(/already included/i);
  await expect(debt).toContainText(/does not establish|does not mean|not a total/i);
  await expect(debt.locator('[data-printed-form="-"]')).toContainText("$0");
  await page.getByRole("link", { name: "Open the parks explainer" }).click();
  await expect(page).toHaveURL(/\/services\/parks\//);
  await expect(page.getByRole("heading", { name: "How the parks figures fit together" })).toBeVisible();
  const total = page.getByRole("region", { name: "One fund: $22,510,172" });
  await expect(total).toContainText("$17,475,148");
  await expect(total).toContainText("$5,035,024");
  await expect(total).toContainText("count it twice");
  await expect(page.locator("#parks-transfers")).toContainText("$4,550,000");
  await expect(page.locator("#parks-transfers")).toContainText("$460,024");
  await expect(page.locator("#parks-transfers")).toContainText("$25,000");
  await expect(page.locator('#parks-transfers a[href$="#page=48"]')).toBeVisible();
});

test("parks parts can be opened on a phone with accessible source detail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/services/parks/");
  await page.getByRole("link", { name: "Services and equipment $17,475,148" }).click();
  await expect(page).toHaveURL(/#parks-services$/);
  await expect(page.locator("#parks-services")).toContainText("$10,607,786");
  await expect(page.locator("#parks-services")).toContainText("$400,000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
});

test("FY2026 parks context appears on matching detail pages only", async ({ page }) => {
  await page.goto("/e/use.debt.parks-recreation-tourism/?fy=2026");
  const context = page.getByRole("complementary", { name: "What the FY2026 parks debt-summary line means" });
  await expect(context).toContainText("$460,024");
  await expect(context.getByRole("link", { name: "How the parks figures fit together" })).toBeVisible();
  await page.goto("/e/use.debt.parks-recreation-tourism/?fy=2025");
  await expect(page.getByRole("complementary", { name: "What the FY2026 parks debt-summary line means" })).toHaveCount(0);
});
