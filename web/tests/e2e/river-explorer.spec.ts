import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const FY2022_AUTHORITY = 205_859_228;
const FY2022_MONEY_IN = 200_310_385;
const FY2026_AUTHORITY = 275_141_134;
const FY2026_MONEY_IN = 269_091_862;
const usd = (value: number) => `$${value.toLocaleString("en-US")}`;

async function expectNoAxeViolations(
  page: import("@playwright/test").Page,
  label: string,
  testInfo: import("@playwright/test").TestInfo,
) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await testInfo.attach(`axe-${label}`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  expect(results.violations, label).toEqual([]);
}

function explorer(page: import("@playwright/test").Page) {
  return page.getByTestId("county-money-explorer");
}

test.describe("river explorer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await explorer(page).getByLabel("Budget year").selectOption("2026");
  });

  test("changing FY2022 to FY2026 replaces every visible General Fund reconciliation", async ({ page }) => {
    const region = explorer(page);
    const year = region.getByLabel("Budget year");
    const reconciliation = region.getByLabel("General Fund funding reconciliation");

    await year.selectOption("2022");
    await expect(region.getByText("July 2021–June 2022")).toBeVisible();
    await expect(reconciliation).toContainText(usd(FY2022_MONEY_IN));
    await expect(reconciliation).toContainText(usd(FY2022_AUTHORITY));
    await expect(region.getByRole("button", { name: /Select Property Taxes: \$112,186,696/ })).toBeVisible();

    await year.selectOption("2026");
    await expect(region.getByText("July 2025–June 2026")).toBeVisible();
    await expect(reconciliation).toContainText(usd(FY2026_MONEY_IN));
    await expect(reconciliation).toContainText(usd(FY2026_AUTHORITY));
    await expect(reconciliation).not.toContainText(usd(FY2022_AUTHORITY));
    await expect(region.getByRole("button", { name: /Select Property Taxes: \$158,487,600/ })).toBeVisible();
    await expect(region.getByRole("button", { name: /Select Property Taxes: \$112,186,696/ })).toHaveCount(0);
  });

  test("a source branch gives exact citation and returns keyboard focus after Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const region = explorer(page);
    const propertyTaxes = region.getByRole("button", { name: /Select Property Taxes: \$158,487,600/ });

    await propertyTaxes.focus();
    await expect(propertyTaxes).toBeFocused();
    await page.keyboard.press(" ");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Property Taxes");
    await expect(dialog).toContainText(usd(158_487_600));
    const source = dialog.getByRole("link", { name: "Source: FY2026, printed page 36 ↗" });
    await expect(source).toHaveAttribute(
      "href",
      "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf#page=37",
    );
    await expect(dialog.getByRole("link", { name: "Open budget details and history →" }))
      .toHaveAttribute("href", "/e/rev.property-taxes/?fy=2026");

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(propertyTaxes).toBeFocused();
  });

  test("county General Fund branch changes scope through its dialog", async ({ page }) => {
    const region = explorer(page);
    await region.getByRole("button", { name: "Four fund groups" }).click();
    const generalFund = region.getByRole("button", { name: /Select General Fund: \$275,141,134/ }).first();
    await generalFund.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Explore this fund →" })).toBeVisible();
    await dialog.getByRole("button", { name: "Explore this fund →" }).click();

    await expect(region.getByRole("button", { name: "General Fund", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(region.getByRole("heading", { name: "Where the money comes from and goes" })).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("phone controls meet target and reflow requirements at narrow widths", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 760 });
      await page.goto("/");
      const region = explorer(page);
      await expect(region.getByText(/Read from top to bottom: funding and any use of fund balance make up the fund total/i)).toBeVisible();
      await expect(region.getByRole("heading", { name: "Funding for this fund" })).toBeVisible();
      await expect(region.getByRole("heading", { name: "Fund balance used" })).toBeVisible();
      await expect(region.getByText("A planned use of fund balance, separate from money coming in.")).toBeVisible();
      await expect(region.getByText("General Fund total", { exact: true })).toBeVisible();
      await expect(region.getByRole("heading", { name: "Budgeted spending" })).toBeVisible();
      const visibleControlHeights = await region.getByRole("button").evaluateAll((buttons) => buttons
        .filter((button) => {
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((button) => ({ name: button.getAttribute("aria-label") ?? button.textContent, height: button.getBoundingClientRect().height })));
      expect(visibleControlHeights.length).toBeGreaterThan(5);
      for (const control of visibleControlHeights) expect(control.height, `${width}px ${control.name}`).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });

  test("river CSV carries scope, values, and source pages", async ({ page }) => {
    const region = explorer(page);
    const generalHref = await region.getByRole("link", { name: "Download funding and spending data (CSV)" }).getAttribute("href");
    const generalCsv = decodeURIComponent(generalHref!.replace("data:text/csv;charset=utf-8,", ""));
    expect(generalCsv).toContain('"fiscal_year","scope","plan_status","accounting_role"');
    expect(generalCsv).toContain('"2026","general","Adopted","revenue","Property Taxes","","158487600"');
    expect(generalCsv).toContain('"FY2026","36","37"');

    await region.getByRole("button", { name: "Four fund groups" }).click();
    const countyHref = await region.getByRole("link", { name: "Download funding and spending data (CSV)" }).getAttribute("href");
    const countyCsv = decodeURIComponent(countyHref!.replace("data:text/csv;charset=utf-8,", ""));
    expect(countyCsv).toContain('"2026","county","Adopted","spending_authority","County-published total of four fund groups; a transfer between them is counted in both","","477233755"');
    expect(countyCsv).toContain('"2026","county","Adopted","fund","General Fund","","275141134"');
    expect(countyCsv).toContain('"FY2026","35","36"');
  });

  for (const width of [1440, 390]) {
    test(`has no Axe violations in either scope or an open branch dialog at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      const region = explorer(page);

      await expectNoAxeViolations(page, `${width}-general`, testInfo);

      await region.getByRole("button", { name: "Four fund groups" }).click();
      await expect(region.getByRole("heading", { name: "Four fund groups, each with a purpose" })).toBeVisible();
      await expectNoAxeViolations(page, `${width}-county`, testInfo);

      await region.getByRole("button", { name: "General Fund", exact: true }).click();
      // This test checks accessibility, so it opens the branch for whatever year the home page
      // shows; the figures themselves are asserted by the year-pinned tests above.
      const propertyTaxes = region.getByRole("button", { name: /Select Property Taxes: \$[\d,]+/ }).first();
      await propertyTaxes.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoAxeViolations(page, `${width}-branch-dialog`, testInfo);
    });
  }
});
