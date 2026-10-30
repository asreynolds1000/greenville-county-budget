import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Scan the shipped export, including the trust pages and both fund presentations.
// Automated checks complement the existing keyboard/reflow tests; they do not claim
// to replace a human screen-reader review.
const routes = [
  "/",
  "/compare/",
  "/e/budget.total/?fy=2026",
  "/e/fund.general/?fy=2025",
  "/e/fund.special-revenue/?fy=2026",
  "/e/dept.sheriff/?fy=2026",
  "/methodology/",
  "/about/",
  "/corrections/",
  "/downloads/",
  "/search/?q=deputies",
];

for (const width of [1440, 390]) {
  for (const route of routes) {
    test(`accessibility: ${route} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("main")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      await testInfo.attach("axe-results", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });
      if (process.env.REVIEW_SCREENSHOTS === "1") {
        await page.screenshot({ path: testInfo.outputPath("page.png"), fullPage: true });
      }
      expect(results.violations).toEqual([]);
    });
  }
}
