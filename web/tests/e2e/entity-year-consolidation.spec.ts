import { expect, test } from "@playwright/test";
import { assertFundYear, fundEvidence, fundHeadline, type FundId } from "./helpers/fund-evidence";

// All 19 cases passed on the browser-capable machine (2026-09-11).
// Subsequent source changes still require a rerun there; Playwright is not run in this sandbox.
test("an old inbound URL preserves its year, query context and fragment", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/e/balance.debt.beginning/2024/?ref=archive#change-over-time");
  await expect(page).toHaveURL(/\/e\/balance\.debt\.beginning\/\?fy=2024&ref=archive#change-over-time$/);
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2024");
  const actual = page.locator('[data-canonical-value="balance.debt.beginning|2024|actual|dollars"]');
  await expect(actual).toContainText("$36,090,963");
  await expect(actual.locator('a[href*="greenvillecounty.org"]')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://gcdata.alexreynolds.com/e/balance.debt.beginning/");
  expect(errors).toEqual([]);
});

test("query selection changes figures and chart defaults, reloads, and restores Back/Forward", async ({ page }) => {
  await page.goto("/e/balance.debt.beginning/?fy=2024");
  const selector = page.getByRole("combobox", { name: "Explore fiscal year", exact: true });
  await expect(selector).toHaveValue("2024");
  await expect(page.getByRole("combobox", { name: "Later year" })).toHaveValue("2024");
  await selector.selectOption("2026");
  await expect(page).toHaveURL(/\?fy=2026$/);
  await expect(page.locator('[data-canonical-value="balance.debt.beginning|2026|adopted|dollars"]')).toContainText("$17,679,737");
  await expect(page.getByRole("combobox", { name: "Later year" })).toHaveValue("2026");
  await expect(page.getByRole("heading", { name: "History", exact: true })).toHaveCount(1);
  await expect(page.locator('[data-canonical-value*="|2024|"]')).toHaveCount(0);
  await page.reload();
  await expect(selector).toHaveValue("2026");
  await page.goBack();
  await expect(selector).toHaveValue("2024");
  await expect(page.locator('[data-canonical-value="balance.debt.beginning|2024|actual|dollars"]')).toContainText("$36,090,963");
  await page.goForward();
  await expect(selector).toHaveValue("2026");
});

test("history links select a year without requesting legacy route payloads", async ({ page }) => {
  await page.goto("/e/dept.sheriff/?fy=2026");
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2026");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.locator("#change-over-time figure").getByRole("link", { name: /Open .*FY2025/ }).click();
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2025");
  expect(requests.some((url) => /\/e\/dept\.sheriff\/2025\//.test(url))).toBe(false);
});

test("the General Fund and fund-group selectors retain their distinct views", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/e/fund.general/2017/");
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2017");
  await expect(page.getByRole("heading", { name: "How the General Fund moves through one year" })).toBeVisible();
  await expect(fundHeadline(page, "fund.general")).toContainText("$160,659,290");
  await expect(fundHeadline(page, "fund.general").locator('a[href="https://www.greenvillecounty.org/ManagementandBudget/pdf/2017/BudgetCombined.pdf#page=35"]')).toBeVisible();
  await page.getByRole("combobox", { name: "Choose fiscal year", exact: true }).selectOption("2025");
  await expect(page).toHaveURL(/\?fy=2025$/);
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2025");
  await expect(fundHeadline(page, "fund.general")).toContainText("$251,432,463");
  await page.goto("/e/fund.debt-service/2014/");
  await expect(page.getByRole("combobox", { name: "Explore fiscal year", exact: true })).toHaveValue("2014");
  await assertFundYear(page, "fund.debt-service", 2014);
});

test("invalid explicit years do not display another year's amounts", async ({ page }) => {
  for (const query of ["fy=9999", "fy=2024x", "fy=2024&fy=2025"]) {
    await page.goto(`/e/balance.debt.beginning/?${query}`);
    await expect(page.getByRole("heading", { name: "Fiscal year unavailable" })).toBeVisible();
    await expect(page.locator("[data-canonical-value]")).toHaveCount(0);
  }
  await page.getByRole("combobox", { name: "Explore fiscal year", exact: true }).selectOption("2010");
  await expect(page.locator('[data-canonical-value="balance.debt.beginning|2010|actual|dollars"]')).toContainText("$8,773,496");
});

test("without JavaScript the entity still exposes latest figures, history and the fallback notice", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4321/e/balance.debt.beginning/?fy=2024");
  await expect(page.getByText(/The latest covered year is shown/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.locator('[data-canonical-value="balance.debt.beginning|2027|adopted|dollars"]')).toContainText("$7,261,487");
  const history = page.getByRole("heading", { name: "History", exact: true }).locator("..");
  await expect(history).toContainText("$36,090,963");
  await expect(history).toContainText("$8,773,496");
  const ledger = history.getByRole("table");
  const historicalRow = ledger.getByRole("row").filter({ hasText: "$36,090,963" });
  await expect(historicalRow).toContainText("2024");
  await expect(historicalRow.getByText("$36,090,963", { exact: true })).toBeVisible();
  await expect(historicalRow.locator('a[href="https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf"]')).toBeVisible();
  // The same series CSV is offered under both the chart and the ledger (identical href).
  // Without JS the mobile copy is hidden at desktop width, so assert a VISIBLE one exists
  // rather than picking an arbitrary index.
  await expect(page.getByRole("link", { name: "Download this series (CSV)" })
    .filter({ visible: true }).first()).toBeVisible();
  await context.close();
});

// Executed and passed on the browser-capable machine, 2026-09-11.
for (const entityId of Object.keys(fundEvidence) as FundId[]) {
  test(`${entityId} rebuilds historical panels and restores them with Back`, async ({ page }) => {
    await page.goto(`/e/${entityId}/?fy=2014`);
    const selector = page.getByRole("combobox", { name: "Explore fiscal year", exact: true });
    await assertFundYear(page, entityId, 2014);
    await selector.selectOption("2024");
    await assertFundYear(page, entityId, 2024);
    await page.reload();
    await assertFundYear(page, entityId, 2024);
    await page.goBack();
    await assertFundYear(page, entityId, 2014);
    await page.goForward();
    await assertFundYear(page, entityId, 2024);
  });

  test(`${entityId} accurately discloses historical access and supplies downloads without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4321/e/${entityId}/?fy=2014`);
    await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2027");
    await expect(fundHeadline(page, entityId)).toContainText(fundEvidence[entityId].latest);
    const notice = page.locator("noscript p");
    await expect(notice).toContainText("Historical year detail requires JavaScript.");
    await expect(notice).not.toContainText("full history");
    const csv = notice.getByRole("link", { name: "series CSV", exact: true });
    await expect(csv).toHaveAttribute("href", `/downloads/series/${entityId}.csv`);
    await expect(csv).toBeVisible();
    const response = await page.request.get(new URL(`/downloads/series/${entityId}.csv`, page.url()).href);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("2014");
    await notice.getByRole("link", { name: "site-wide downloads", exact: true }).click();
    await expect(page).toHaveURL(/\/downloads\/$/);
    await expect(page.locator('a[href="/downloads/v2/statements.csv"]')).toBeVisible();
    await context.close();
  });
}

// Browser-verified 2026-09-11: network boundary and accessible failure state.
test("fund data is fetched on historical selection and a failed request can be retried", async ({ page }) => {
  const modelUrl = /\/e\/fund\.debt-service\/panels\.json(?:\?|$)/;
  const requests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/panels.json")) requests.push(request.url()); });
  await page.route(modelUrl, route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/e/fund.debt-service/");
  const selector = page.getByRole("combobox", { name: "Explore fiscal year", exact: true });
  await expect(selector).toHaveValue("2027");
  await expect(page.locator("main h1")).toContainText("Debt Service");
  expect(requests).toHaveLength(0);
  await selector.selectOption("2014");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("FY2014 figures could not be loaded");
  await expect(page.locator("main h1")).toHaveCount(0);
  await page.unroute(modelUrl);
  await selector.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Retry FY2014" })).toBeFocused();
  await page.keyboard.press("Enter");
  await assertFundYear(page, "fund.debt-service", 2014);
  expect(requests).toHaveLength(2);
  expect(new URL(requests[0]).searchParams.get("revision")).toMatch(/^[a-f0-9]{64}$/);
});

// Browser-verified 2026-09-11: hold one response while the requested year changes.
test("a pending historical model renders the currently selected year when it arrives", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route(/\/e\/fund\.debt-service\/panels\.json(?:\?|$)/, async route => {
    requests++;
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/e/fund.debt-service/");
    await expect(fundHeadline(page, "fund.debt-service")).toContainText("$33,861,514");
    const selector = page.getByRole("combobox", { name: "Explore fiscal year", exact: true });
    await selector.selectOption("2014");
    await expect(page.getByRole("status")).toContainText("Loading FY2014 figures");
    await expect(fundHeadline(page, "fund.debt-service")).toHaveCount(0);
    await selector.selectOption("2024");
    await expect(page.getByRole("status")).toContainText("Loading FY2024 figures");
    release();
    await assertFundYear(page, "fund.debt-service", 2024);
    await page.goBack();
    await assertFundYear(page, "fund.debt-service", 2014);
    expect(requests).toBe(1);
  } finally { release(); }
});

// Browser-verified 2026-09-11: matching entity/year and valid JSON cannot bypass the revision.
test("a stale historical fund model fails closed instead of displaying mismatched figures", async ({ page }) => {
  await page.route(/\/e\/fund\.debt-service\/panels\.json(?:\?|$)/, async route => {
    const response = await route.fetch();
    const model = await response.json();
    model.panels[2014].value = 17_501_715;
    model.panels[2014].point.value = 17_501_715;
    await route.fulfill({ response, json: model });
  });
  await page.goto("/e/fund.debt-service/?fy=2014");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("FY2014 figures could not be loaded");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("reload the page");
  await expect(fundHeadline(page, "fund.debt-service")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("$17,501,715");
});
