import { expect, test } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

for (const width of [1440, PHONE.width]) {
  test(`county-fund branch opens detail and reaches the fund at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: PHONE.height });
    await page.goto("/");

    const explorer = page.getByTestId("county-money-explorer");
    await explorer.getByRole("button", { name: "Four fund groups" }).click();
    const generalFund = explorer.getByRole("button", { name: /Select General Fund: \$288,494,094/ }).first();
    await generalFund.focus();
    await expect(generalFund).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "General Fund" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Open budget details and history →" }))
      .toHaveAttribute("href", "/e/fund.general/?fy=2027");

    await dialog.getByRole("link", { name: "Open budget details and history →" }).click();
    await expect(page).toHaveURL(/\/e\/fund\.general\/\?fy=2027/);
  });
}

test("spending-share graphic still reaches FY2027 category details", async ({ page }) => {
  await page.goto("/compare/");
  await page.getByRole("combobox", { name: "Compare", exact: true }).selectOption("categories");
  const shareLink = page.getByTestId("spending-comparison-row")
    .filter({ has: page.getByRole("heading", { name: "Law Enforcement Services", exact: true }) })
    .getByTestId("spending-share-link");
  await expect(shareLink).toHaveAttribute("href", /\/e\/opcat\.law-enforcement\/\?fy=2027/);
  await expect(shareLink).toContainText("Open FY2027 details");
  const shareBox = await shareLink.boundingBox();
  expect(shareBox?.height, "spending-share target height").toBeGreaterThanOrEqual(44);
  await shareLink.click();
  await expect(page).toHaveURL(/\/e\/opcat\.law-enforcement\/\?fy=2027/);
});
