import { expect, test } from "@playwright/test";

/**
 * The global masthead and its skip link (plan Step 2, cold-review finding R4).
 *
 * The review's point about the skip link is the one worth restating: adding site navigation
 * before every page's content is a small regression for a keyboard user landing on a deep
 * entity page, because they now traverse the same four links before reaching anything
 * specific to that page. The skip link is what makes the header net-positive rather than
 * net-negative for them.
 */

const ROUTES = [
  "/",
  "/e/fund.general/?fy=2026",
  "/e/dept.sheriff/?fy=2026",
  "/search/",
  "/methodology/",
  "/corrections/",
  "/downloads/",
];

test.describe("masthead", () => {
  for (const route of ROUTES) {
    test(`${route} exposes Overview and Search without a trip to the footer`, async ({ page }) => {
      await page.goto(route);

      const header = page.getByRole("banner");
      await expect(header).toBeVisible();
      await expect(header.getByRole("link", { name: /budget explorer/i })).toBeVisible();
      await expect(header.getByRole("link", { name: /^search$/i })).toBeVisible();
    });
  }

  test("the footer keeps the publication metadata", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2026");

    // The header is wayfinding; it must not have cannibalised the footer's job.
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText(/independent, non-advocacy/i)).toBeVisible();
    await expect(footer.getByRole("link", { name: /corrections/i })).toBeVisible();
    await expect(footer.getByText(/data version/i)).toBeVisible();
  });

  test("breadcrumbs survive — they communicate hierarchy, not site navigation", async ({
    page,
  }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");
    await expect(page.getByRole("navigation", { name: /breadcrumb/i })).toBeVisible();
  });

  test("wraps cleanly at 320px with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/e/fund.general/?fy=2026");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow at 320px").toBeLessThanOrEqual(1);
  });
});

test.describe("skip link", () => {
  test("is the first focusable control and is visible once focused", async ({ page }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");
    await page.keyboard.press("Tab");

    const focused = page.locator(":focus");
    await expect(focused).toHaveText(/skip to main content/i);

    // Visible when focused. A skip link that stays clipped gives a keyboard user no way to
    // know the control exists — which is the same as not having one.
    await expect(focused).toBeVisible();
    const box = await focused.boundingBox();
    expect(box!.width).toBeGreaterThan(1);
    expect(box!.height).toBeGreaterThan(1);
  });

  test("moves focus past the masthead to the page's content", async ({ page }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/#main-content$/);

    const targetIsFocused = await page.evaluate(
      () => document.activeElement?.id === "main-content",
    );
    expect(targetIsFocused, "focus should land on the main-content target").toBe(true);
  });

  test("there is exactly one main landmark and one skip target per page", async ({ page }) => {
    for (const route of ["/", "/e/fund.general/?fy=2026", "/search/"]) {
      await page.goto(route);
      await expect(page.getByRole("main"), `${route} main landmarks`).toHaveCount(1);
      await expect(page.locator("#main-content"), `${route} skip targets`).toHaveCount(1);
    }
  });
});
