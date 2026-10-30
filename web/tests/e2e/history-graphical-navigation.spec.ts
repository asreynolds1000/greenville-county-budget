import { expect, test } from "@playwright/test";

test.describe("graphical history navigation", () => {
  test("clicking a published chart year opens that fiscal-year page", async ({ page }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");

    const chart = page.locator("#change-over-time figure[data-viz]");
    const yearLink = chart.getByRole("link", { name: /Open .*FY2025/ });
    await expect(yearLink).toBeVisible();
    await yearLink.click();

    await expect(page).toHaveURL(/\/e\/dept\.sheriff\/\?fy=2025$/);
  });

  test("chart year links are keyboard reachable and missing years are not linked", async ({ page }) => {
    await page.goto("/e/dept.indigentdefense/?fy=2008");

    const chart = page.locator("#change-over-time figure[data-viz]");
    const yearLink = chart.getByRole("link", { name: /Open .*FY2005/ });
    await expect(yearLink).toBeVisible();
    await yearLink.focus();
    await expect(yearLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/e\/dept\.indigentdefense\/\?fy=2005$/);

    await page.goBack();
    const restoredChart = page.locator("#change-over-time figure[data-viz]");
    await expect(restoredChart.getByRole("link", { name: /Open .*FY2006/ })).toHaveCount(0);
  });

  test("a long-range phone chart activates the intended year at the point center", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/e/budget.total/?fy=2026");

    await page.getByRole("combobox", { name: "Earlier year" }).selectOption("2002");
    const chart = page.locator("#change-over-time figure[data-viz]");
    const yearLink = chart.getByRole("link", { name: /Open .*FY2015/ });
    await expect(yearLink).toBeVisible();
    await yearLink.scrollIntoViewIfNeeded();
    const box = await yearLink.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page).toHaveURL(/\/e\/budget\.total\/\?fy=2015$/);
  });
});
