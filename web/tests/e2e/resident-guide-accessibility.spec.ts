import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [1440, 720, 390]) {
  test(`all four guide steps remain accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#orientation");
    const guide = page.getByTestId("resident-orientation");
    for (let step = 1; step <= 4; step++) {
      await expect(guide.getByText(`Step ${step} of 4`, { exact: true })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, `step ${step}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const sizes = await guide.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
      expect(sizes.every((height) => height >= 44)).toBe(true);
      if (step < 4) await guide.getByRole("button", { name: "Next", exact: true }).click();
    }
    await guide.getByRole("button", { name: "Explore the budget" }).click();
    await expect(page.locator("#money-explorer-title")).toBeFocused();
  });
}

test("choosing ambulance services opens its own cited budget using the General Fund denominator", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("county-money-explorer").getByLabel("Budget year").selectOption("2026");
  await page.getByRole("button", { name: "Four fund groups", exact: true }).click();
  const guide = page.getByTestId("resident-orientation");
  await guide.getByRole("button", { name: "Follow a tax dollar" }).click();
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  const ems = guide.getByRole("button", { name: "Open Ambulance services", exact: true });
  await ems.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ambulance services", exact: true })).toBeVisible();
  await expect(dialog).toContainText("$32,783,093");
  await expect(dialog).not.toContainText("$44,035,256");
  await expect(dialog).toContainText("11.9% of General Fund");
  await expect(dialog).toContainText("emergency treatment");
  await expect(dialog.getByRole("link", { name: "Open budget details and history →" }))
    .toHaveAttribute("href", "/e/dept.emergencymedicalservices/?fy=2026");
  await expect(dialog.getByRole("link", { name: "Source: FY2026, printed page 57 ↗" }))
    .toHaveAttribute("href", /#page=58$/);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(ems).toBeFocused();
});

test("the roads explanation fits a phone and retains accessible source links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/services/roads/");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("link", { name: "FY2026 county budget, printed p.150" }))
    .toHaveAttribute("href", /#page=151$/);
});
