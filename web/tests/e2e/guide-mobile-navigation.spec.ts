import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

for (const width of [320, 390, 820]) {
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    test(`keeps touch navigation in place at ${width}px (${reducedMotion})`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto("/#orientation");
      const guide = page.getByTestId("resident-orientation");
      const heading = guide.locator("#orientation-step-title");
      await expect(heading).toBeFocused();
      await page.evaluate(() => document.fonts.ready);

      // Read the new step without the viewport following a resized diagram or footer.
      for (const step of [2, 3, 4, 3, 2, 1]) {
        const name = step > Number(await guide.getByRole("progressbar").getAttribute("aria-valuenow")) ? "Next" : "Back";
        const button = guide.getByRole("button", { name, exact: true });
        await expect(button).toBeInViewport({ ratio: 1 });
        const before = await page.evaluate(() => window.scrollY);
        await button.tap();
        await expect(guide.getByText(`Step ${step} of 4`, { exact: true })).toBeVisible();
        await expect(heading).toBeFocused();
        // Let layout and browser scroll anchoring settle before checking the viewport.
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThanOrEqual(2);
        await expect(heading).toBeInViewport({ ratio: 1 });
      }

      await guide.getByRole("button", { name: "Skip guide", exact: true }).tap();
      await expect(page.locator("#money-explorer-title")).toBeFocused();
      await expect(page.locator("#money-explorer-title")).toBeInViewport();
    });
  }
}

test("keeps the new heading reachable for keyboard Back and Next", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const guide = page.getByTestId("resident-orientation");
  await guide.getByRole("button", { name: "Follow a tax dollar" }).press("Enter");
  await guide.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(guide.getByRole("heading", { name: "The General Fund is the county’s main account for everyday services." })).toBeFocused();
  await guide.getByRole("button", { name: "Back", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(guide.getByRole("heading", { name: "Your bill supports several governments and agencies." })).toBeFocused();
});
