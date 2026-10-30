import { expect, test } from "@playwright/test";

for (const route of ["/", "/methodology/"]) {
  test(`recency boundary is prominent on ${route}`, async ({ page }) => {
    await page.goto(route);
    const notice = page.locator('[data-recency-notice="true"]');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("FY2027 is adopted, but not yet in this explorer");
    await expect(notice).toContainText("FY2026 covers July 2025–June 2026");
    await expect(notice).toContainText("June 16, 2026");
    await expect(notice).toContainText(
      "no consolidated final source located in the official publications checked.",
    );
    await expect(notice).toContainText(/Data status checked September 6, 2026 · Version [a-f0-9]{12}/);
  });
}
