import { expect, test } from "@playwright/test";

function explorer(page: import("@playwright/test").Page) {
  return page.getByTestId("county-money-explorer");
}

function orientation(page: import("@playwright/test").Page) {
  return page.getByTestId("resident-orientation");
}

test.describe("resident orientation", () => {
  test("walks from a property-tax bill to the selected-year river without inventing a tax-to-service path", async ({ page }) => {
    await page.goto("/");
    const guide = orientation(page);

    await guide.getByRole("button", { name: "Follow a tax dollar" }).click();
    await expect(guide.getByRole("heading", { name: "Your bill supports several governments and agencies." })).toBeVisible();
    await expect(guide.getByText("not shares of a bill")).toBeVisible();
    await expect(guide.getByRole("link", { name: "Show my property →" })).toHaveAttribute("href", "/property-tax/");

    await guide.getByRole("button", { name: "Next" }).click();
    await expect(guide.getByRole("heading", { name: "The General Fund is the county’s main account for everyday services." })).toBeVisible();
    await expect(guide.getByText("Fund balance is not a bank balance or automatically spare money")).toBeVisible();

    await guide.getByRole("button", { name: "Next" }).click();
    await expect(guide.getByRole("heading", { name: "County money supports everyday services." })).toBeVisible();
    await expect(guide.getByText(/not a receipt for one resident['’]s payment/)).toBeVisible();

    await guide.getByRole("button", { name: "Next" }).click();
    await expect(guide.getByRole("heading", { name: "A budget is a plan for one fiscal year." })).toBeVisible();
    await guide.getByRole("button", { name: "Show FY2025" }).click();
    await expect(explorer(page).getByLabel("Budget year")).toHaveValue("2025");
    await expect(guide.getByRole("link", { name: "See FY2025 planned and audited actual →" })).toHaveAttribute("href", "/e/fund.general/?fy=2025");

    await guide.getByRole("button", { name: "Explore the budget" }).click();
    await expect(guide.getByRole("button", { name: "Restart the guide" })).toBeVisible();
  });

  test("can skip and restart the inline guide with a keyboard", async ({ page }) => {
    await page.goto("/");
    const guide = orientation(page);
    await guide.getByRole("button", { name: "Follow a tax dollar" }).click();
    const skip = guide.getByRole("button", { name: "Skip guide" });
    await skip.focus();
    await page.keyboard.press("Enter");
    await expect(guide.getByRole("button", { name: "Restart the guide" })).toBeVisible();
    await guide.getByRole("button", { name: "Restart the guide" }).click();
    await expect(guide.getByText("Step 1 of 4")).toBeVisible();
  });

  test("opens from the property-tax walkthrough anchor and fits a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    await page.goto("/#orientation");
    const guide = orientation(page);
    await expect(guide.getByRole("heading", { name: "Your bill supports several governments and agencies." })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("keeps historical planned-versus-actual links in the selected fiscal year", async ({ page }) => {
    await page.goto("/");
    const guide = orientation(page);
    await guide.getByRole("button", { name: "Follow a tax dollar" }).click();
    await guide.getByRole("button", { name: "Next" }).click();
    await guide.getByRole("button", { name: "Next" }).click();
    await guide.getByRole("button", { name: "Next" }).click();
    await explorer(page).getByLabel("Budget year").selectOption("2022");
    await expect(guide.getByText("FY2022 audited actual")).toBeVisible();
    await expect(guide.getByRole("link", { name: "See FY2022 planned and audited actual →" })).toHaveAttribute("href", "/e/fund.general/?fy=2022");
  });
});
