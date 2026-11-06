import { expect, test, type Page } from "@playwright/test";

/** FY2026 General Fund adopted plan. These acceptance values protect the accounting boundary. */
const ESTIMATED_REVENUE = 247_676_869;
const TRANSFERS_IN = 21_414_993;
const MONEY_IN = ESTIMATED_REVENUE + TRANSFERS_IN; // 269,091,862
const PLANNED_DRAW = 6_049_272;
const SPENDING_AUTHORITY = MONEY_IN + PLANNED_DRAW; // 275,141,134
const FOUR_FUND_AUTHORITY = 477_233_755;
const FOUR_FUNDS = [275_141_134, 133_984_290, 34_885_734, 33_222_597];

const usd = (value: number) => `$${value.toLocaleString("en-US")}`;
const explorer = (page: Page) => page.getByTestId("county-money-explorer");

async function fundingAndSpendingCsv(page: Page) {
  const href = await explorer(page).getByRole("link", { name: "Download funding and spending data (CSV)" }).getAttribute("href");
  expect(href?.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
  return decodeURIComponent(href!.replace("data:text/csv;charset=utf-8,", ""));
}

test.describe("county money explorer — accounting boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await explorer(page).getByLabel("Budget year").selectOption("2026");
  });

  test("General Fund keeps money in, savings used, and planned spending separate", async ({ page }) => {
    const region = explorer(page);
    const reconciliation = region.getByLabel("General Fund funding reconciliation");

    await expect(region.getByRole("heading", { name: "Where the money comes from and goes" })).toBeVisible();
    await expect(reconciliation).toContainText("Total money in");
    await expect(reconciliation).toContainText(usd(MONEY_IN));
    await expect(reconciliation).toContainText("Revenue plus transfers in");
    await expect(reconciliation).toContainText("Planned use of fund balance");
    await expect(reconciliation).toContainText(usd(PLANNED_DRAW));
    await expect(reconciliation).toContainText("A draw on fund balance");
    await expect(reconciliation).toContainText("Planned money out");
    await expect(reconciliation).toContainText(usd(SPENDING_AUTHORITY));

    // The savings draw funds planned spending but remains outside the money-in total.
    expect(MONEY_IN).not.toBe(SPENDING_AUTHORITY);
    await expect(region.getByRole("button", { name: /Select Planned use of fund balance: \$6,049,272/ })).toBeVisible();
  });

  test("county scope shows four gross fund authorities without inventing countywide revenue", async ({ page }) => {
    const region = explorer(page);
    await region.getByRole("button", { name: "Four fund groups" }).click();

    await expect(region.getByRole("heading", { name: "Four fund groups, each with a purpose" })).toBeVisible();
    await expect(region.getByText(usd(FOUR_FUND_AUTHORITY)).first()).toBeVisible();
    await expect(region.getByText(/Countywide revenue is not shown\. Money in is covered/i).first()).toBeVisible();
    await expect(region.getByRole("figure").locator("figcaption")).toContainText(/gross spending authority, including transfers between funds/i);

    await region.getByText("View funding and spending figures and sources as a table").click();
    const table = region.getByRole("table", { name: /four fund groups that make up.*funding, fund total, spending, and sources/i });
    await expect(table).toBeVisible();
    for (const amount of FOUR_FUNDS) await expect(table).toContainText(usd(amount));
    expect(FOUR_FUNDS.reduce((sum, amount) => sum + amount, 0)).toBe(FOUR_FUND_AUTHORITY);
  });

  test("the funding and spending view keeps its table, source citation, and exact CSV values", async ({ page }) => {
    const region = explorer(page);
    const figure = region.getByRole("figure");

    await expect(figure.locator("figcaption")).toContainText(/FY2026 General Fund funding and uses, sized by dollars/i);
    await region.getByText("View funding and spending figures and sources as a table").click();
    const table = region.getByRole("table", { name: /FY2026 General Fund funding and uses.*funding, fund total, spending, and sources/i });
    await expect(table).toContainText("Property Taxes");
    await expect(table).toContainText(usd(158_487_600));
    await expect(table.getByRole("link", { name: "FY2026 · p.36" }).first()).toHaveAttribute(
      "href",
      "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf#page=37",
    );

    const csv = await fundingAndSpendingCsv(page);
    expect(csv).toContain('"2026","general","Adopted","spending_authority","the most it can spend this year","","275141134"');
    expect(csv).toContain('"2026","general","Adopted","revenue","Property Taxes","","158487600"');
    expect(csv).toContain('"2026","general","Adopted","reserve","Planned use of fund balance","","6049272"');
    expect(csv).toContain('"EMS and county support","Department of Administration","44035256"');
    expect(csv).toContain('"FY2026","36","37"');
  });

  test("coverage remains available in its disclosure instead of being lost below the explorer", async ({ page }) => {
    const summary = page.getByText("What is included, and where are the gaps?", { exact: true });
    await summary.click();
    await expect(page.getByText(/This page shows the General Fund.s money in and out\. Each other fund has its own page/i)).toBeVisible();
    await expect(page.getByText(/The General Fund.s beginning balance, change during the year and ending balance are on its own page/i)).toBeVisible();
    await expect(page.getByText(/Internal Service Fund tracks departments billing each other/i)).toBeVisible();
    await expect(page.getByText(/complete General Fund funding and spending view is available for FY2022, FY2023, FY2024, FY2025, FY2026, FY2027/i)).toBeVisible();
  });

  test("the explorer does not introduce horizontal page scrolling", async ({ page }) => {
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
