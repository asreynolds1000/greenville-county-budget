import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const GIS = "https://www.gcgis.org";
const PROPERTY_RECORD_API = "**/api/property-record";

const ADDRESS_CHOICE = "206 S MAIN ST, GREENVILLE, 29601 GREENVILLE";

type ParcelAttributes = {
  PIN: string;
  STRNUM: string;
  LOCATE: string;
  DIST: string;
  TAXMKTVAL: number | null;
};

type PropertyRecordFixture = {
  pin: string;
  taxYear: 2025;
  receipt: string;
  item: string;
  district: string;
  taxableMarketValue: number | null;
  assessmentClass: string | null;
  assessmentRatio: 4 | 6 | null;
  homestead: boolean | null;
  taxes: number | null;
};

function countyJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
}

/** Deterministic browser-only GIS fixture. It deliberately has no owner fields. */
async function mockCountyLookup(
  page: Page,
  {
    delayFirstSuggestion = false,
    parcelFeatures = [{ PIN: "0059000400201", STRNUM: "206", LOCATE: "MAIN", DIST: "501", TAXMKTVAL: 500730 }],
    record = null,
    recordDelayMs = 0,
  }: { delayFirstSuggestion?: boolean; parcelFeatures?: ParcelAttributes[]; record?: PropertyRecordFixture | null; recordDelayMs?: number } = {},
): Promise<{ suggestionRequests: number }> {
  let firstSuggestion = true;
  const calls = { suggestionRequests: 0 };
  await page.route(PROPERTY_RECORD_API, async (route) => {
    if (recordDelayMs) await new Promise((resolve) => setTimeout(resolve, recordDelayMs));
    if (record) await countyJson(route, { record });
    else await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
  });
  await page.route(`${GIS}/**`, async (route) => {
    const url = new URL(route.request().url());
    try {
      if (url.pathname.endsWith("/suggest")) {
        calls.suggestionRequests += 1;
        if (delayFirstSuggestion && firstSuggestion) {
          firstSuggestion = false;
          await new Promise((resolve) => setTimeout(resolve, 150));
          await countyJson(route, { suggestions: [{ text: "STALE ADDRESS", magicKey: "stale-key" }] });
          return;
        }
        await countyJson(route, { suggestions: [{ text: ADDRESS_CHOICE, magicKey: "county-key" }] });
        return;
      }
      if (url.pathname.endsWith("/findAddressCandidates")) {
        await countyJson(route, {
          spatialReference: { wkid: 103146, latestWkid: 6570 },
          candidates: [{ location: { x: 1_579_806.5, y: 1_099_842.6 } }],
        });
        return;
      }
      if (url.pathname.endsWith("/query")) {
        await countyJson(route, { features: parcelFeatures.map((attributes) => ({ attributes })) });
        return;
      }
      await route.abort();
    } catch {
      // The cancellation test intentionally aborts its first request before this delayed
      // handler can fulfill it. The page's request-generation guard is the behavior under test.
    }
  });
  return calls;
}

async function openCalculationDetails(page: Page): Promise<void> {
  const summary = page.locator("summary").filter({ hasText: "Review or change details" });
  if (!(await summary.locator("..").evaluate((el) => (el as HTMLDetailsElement).open))) await summary.click();
}

async function fillManualCalculation(
  page: Page,
  { district = "501", value = "500730", ratio = "4", homestead = "no" }: {
    district?: string;
    value?: string;
    ratio?: "4" | "6";
    homestead?: "yes" | "no";
  } = {},
): Promise<void> {
  await openCalculationDetails(page);
  await page.getByLabel("Tax district").selectOption(district);
  await page.getByLabel("2025 taxable market value").fill(value);
  await page.getByLabel("Is this your primary home?").selectOption(ratio);
  await page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)").selectOption(homestead);
  await page.getByRole("button", { name: "Calculate estimate" }).click();
}

test("an exact county address choice immediately fills one parcel and keeps the full estimate inspectable", async ({ page }) => {
  await mockCountyLookup(page);
  await page.goto("/property-tax/");

  await page.getByLabel("Street address").fill("206 S Main St");
  await page.getByRole("button", { name: "Find parcel" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Choose an exact address" })).toBeVisible();
  await expect(page.getByRole("button", { name: ADDRESS_CHOICE })).toBeVisible();
  await expect(page.getByRole("button", { name: /206 MAIN/i })).toHaveCount(0);

  await page.getByRole("button", { name: ADDRESS_CHOICE }).click();
  await expect(page.getByText(/2025 county record is unavailable/i).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Parcel choices" })).toHaveCount(0);
  await expect(page.getByText(/Selected property: 206 MAIN/i)).toBeVisible();
  await expect(page.getByLabel("Tax district")).toHaveValue("501");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("500730");

  await page.getByLabel("Is this your primary home?").selectOption("4");
  await page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)").selectOption("no");
  await page.getByRole("button", { name: "Calculate estimate" }).click();

  const result = page.getByRole("region", { name: "Where the estimate goes" });
  await expect(result).toBeVisible();
  const graphic = result.locator("[data-viz]");
  await expect(graphic.getByRole("list", { name: "Estimated tax allocation" }).getByRole("button", { name: /City of Greenville/i })).toBeVisible();
  await expect(graphic).not.toContainText("Greenville city or town");
  const countyOperations = graphic.getByRole("list", { name: "Estimated tax allocation" }).getByRole("button", { name: /Greenville County operations/i });
  await countyOperations.focus();
  await expect(countyOperations).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(result.getByText(/Source page \d+ · [\d.]+ mills/)).toBeVisible();

  await graphic.getByText("View estimate as a table").click();
  await expect(graphic.getByRole("table", { name: "Estimated property-tax allocation by taxing entity" })).toBeVisible();
  const csvLink = graphic.getByRole("link", { name: "Download this estimate (CSV)" });
  await expect(csvLink).toHaveAttribute("href", /^data:text\/csv/);
  const csvHref = await csvLink.getAttribute("href");
  const csv = decodeURIComponent(csvHref!.replace("data:text/csv;charset=utf-8,", ""));
  expect(csv).toContain("taxable_market_value,500730.00");
  expect(csv).toContain("assessment_ratio,4%");
  expect(csv).toContain("homestead,no");
  expect(csv).toContain("source_url,https://www.greenvillecounty.org/Auditor/Forms/millage_2025.pdf");
  expect(csv).toContain("source_sha256,");
  expect(csv).toContain("excludes fees, other credits, penalties, and other parcel-specific charges.");
  await expect(graphic.getByRole("link", { name: "View verified rate source" })).toHaveAttribute("href", /^https:\/\//);
});

test("a delayed lookup cannot replace a newer auto-filled parcel", async ({ page }) => {
  await mockCountyLookup(page, { delayFirstSuggestion: true });
  await page.goto("/property-tax/");
  const query = page.getByLabel("Street address");

  await query.fill("first address");
  await page.getByRole("button", { name: "Find parcel" }).click();
  await query.fill("0059-0004-00201");
  await page.getByRole("button", { name: "Find parcel" }).click();

  await expect(page.getByText(/2025 county record is unavailable/i).first()).toBeVisible();
  await expect(page.getByLabel("Tax district")).toHaveValue("501");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("500730");
  await page.waitForTimeout(200);
  await expect(page.getByText("STALE ADDRESS")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Address choices" })).toHaveCount(0);
});

test("an exact PIN auto-fills one county parcel without address suggestions", async ({ page }) => {
  const calls = await mockCountyLookup(page);
  await page.goto("/property-tax/");

  await page.getByLabel("Street address").fill("0059-0004-00201");
  await page.getByRole("button", { name: "Find parcel" }).click();

  await expect(page.getByText(/2025 county record is unavailable/i).first()).toBeVisible();
  await expect(page.getByLabel("Tax district")).toHaveValue("501");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("500730");
  await expect(page.getByRole("group", { name: "Parcel choices" })).toHaveCount(0);
  expect(calls.suggestionRequests).toBe(0);
});

test("multiple county parcels require an informed property choice", async ({ page }) => {
  await mockCountyLookup(page, { parcelFeatures: [
    { PIN: "0059000400201", STRNUM: "206", LOCATE: "MAIN", DIST: "501", TAXMKTVAL: 500730 },
    { PIN: "0059000400202", STRNUM: "208", LOCATE: "MAIN", DIST: "065", TAXMKTVAL: 325000 },
  ] });
  await page.goto("/property-tax/");

  await page.getByLabel("Street address").fill("0059-0004-00201");
  await page.getByRole("button", { name: "Find parcel" }).click();

  const choices = page.getByRole("group", { name: "Parcel choices" });
  await expect(choices).toContainText("More than one county parcel matched");
  await expect(choices.getByRole("button", { name: /Use this property: 206 MAIN.*District 501.*\$500,730\.00/ })).toBeVisible();
  await expect(choices.getByRole("button", { name: /Use this property: 208 MAIN.*District 065.*\$325,000\.00/ })).toBeVisible();
  await expect(page.getByLabel("Tax district")).toHaveValue("");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("");

  await choices.getByRole("button", { name: /Use this property: 208 MAIN/ }).click();
  await expect(page.getByText(/2025 county record is unavailable/i).first()).toBeVisible();
  await expect(page.getByLabel("Tax district")).toHaveValue("065");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("325000");
});

test("an address selection automatically estimates from the complete county record with details collapsed", async ({ page }) => {
  await mockCountyLookup(page, { record: {
    pin: "0059000400201", taxYear: 2025, receipt: "123456", item: "01",
    district: "065", taxableMarketValue: 100000, assessmentClass: "LR",
    assessmentRatio: 4, homestead: true, taxes: 1234.56,
  } });
  await page.goto("/property-tax/");
  await expect(page.getByLabel("Tax district")).toBeHidden();
  await page.getByLabel("Street address").fill("206 S Main St");
  await page.getByRole("button", { name: "Find parcel" }).click();
  await page.getByRole("button", { name: ADDRESS_CHOICE }).click();

  const result = page.getByRole("region", { name: "Where the estimate goes" });
  await expect(result).toBeVisible();
  // Independent oracle: $50,000 after homestead × 4% × 108.9 payable mills.
  await expect(result).toContainText("$217.80");
  await expect(page.getByLabel("Tax district")).toBeHidden();
  await expect(page.getByRole("button", { name: "Calculate estimate" })).toBeHidden();
  await expect(page.getByText(/Taxes listed for 2025:.*\$1,234\.56.*not this estimate.*payment status/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "View official 2025 county record →" })).toHaveAttribute(
    "href", "https://www.greenvillecounty.org/appsas400/RealProperty/Details.aspx?MapNumber=0059000400201&TaxYear=2025&Receipt=123456&Item=01",
  );
  await openCalculationDetails(page);
  await expect(page.getByLabel("Tax district")).toHaveValue("065");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("100000");
  await expect(page.getByLabel("Is this your primary home?")).toHaveValue("4");
  await expect(page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)")).toHaveValue("yes");
  await expect(page.getByText(/Assessment class LR/i)).toBeVisible();
  await page.getByLabel("2025 taxable market value").fill("200000");
  await expect(result).toHaveCount(0);
  await page.getByRole("button", { name: "Calculate estimate" }).click();
  await expect(result).toContainText("$653.40");
});

test("a delayed county record cannot overwrite an edited calculation field", async ({ page }) => {
  await mockCountyLookup(page, { record: {
    pin: "0059000400201",
    taxYear: 2025,
    receipt: "123456",
    item: "01",
    district: "065",
    taxableMarketValue: 100000,
    assessmentClass: "LR",
    assessmentRatio: 4,
    homestead: true,
    taxes: 1234.56,
  }, recordDelayMs: 500 });
  await page.goto("/property-tax/");

  await page.getByLabel("Street address").fill("0059-0004-00201");
  await page.getByRole("button", { name: "Find parcel" }).click();
  await expect(page.getByText("Loading 2025 tax record…")).toBeVisible();
  await openCalculationDetails(page);
  await page.getByLabel("2025 taxable market value").fill("777777");
  await page.waitForTimeout(600);

  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("777777");
  await expect(page.getByLabel("Is this your primary home?")).toHaveValue("");
  await expect(page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)")).toHaveValue("");
  await expect(page.getByText(/Filled from your 2025 county record/i)).toHaveCount(0);
  await expect(page.getByText("Loading 2025 tax record…")).toHaveCount(0);
});

test("a pending GIS lookup cannot replace inputs edited in the details accordion", async ({ page }) => {
  await mockCountyLookup(page, { delayFirstSuggestion: true });
  await page.goto("/property-tax/");

  await page.getByLabel("Street address").fill("first address");
  await page.getByRole("button", { name: "Find parcel" }).click();
  await openCalculationDetails(page);
  await page.getByLabel("Tax district").selectOption("065");
  await page.getByLabel("2025 taxable market value").fill("123456");
  await page.getByLabel("Is this your primary home?").selectOption("4");
  await page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)").selectOption("no");
  await page.waitForTimeout(200);

  await expect(page.getByLabel("Tax district")).toHaveValue("065");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("123456");
  await expect(page.getByLabel("Is this your primary home?")).toHaveValue("4");
  await expect(page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)")).toHaveValue("no");
  await expect(page.getByText("STALE ADDRESS")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Address choices" })).toHaveCount(0);
});

test("a null tax-year county value clears the prior calculation instead of keeping a GIS value", async ({ page }) => {
  await mockCountyLookup(page, { parcelFeatures: [
    { PIN: "0059000400203", STRNUM: "210", LOCATE: "MAIN", DIST: "501", TAXMKTVAL: 500730 },
  ], record: {
    pin: "0059000400203",
    taxYear: 2025,
    receipt: "123456",
    item: "01",
    district: "501",
    taxableMarketValue: null,
    assessmentClass: null,
    assessmentRatio: null,
    homestead: null,
    taxes: null,
  } });
  await page.goto("/property-tax/");
  await fillManualCalculation(page);
  await expect(page.getByRole("region", { name: "Where the estimate goes" })).toBeVisible();

  await page.getByLabel("Street address").fill("0059-0004-00203");
  await page.getByRole("button", { name: "Find parcel" }).click();

  await expect(page.getByLabel("2025 taxable market value")).toBeVisible();
  await expect(page.getByText(/Taxable market value not provided/i)).toBeVisible();
  await expect(page.getByLabel("Tax district")).toHaveValue("501");
  await expect(page.getByLabel("2025 taxable market value")).toHaveValue("");
  await expect(page.getByLabel("Is this your primary home?")).toHaveValue("");
  await expect(page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)")).toHaveValue("");
  await expect(page.getByRole("region", { name: "Where the estimate goes" })).toHaveCount(0);
});

test("an unavailable county lookup keeps the manual calculation available", async ({ page }) => {
  await page.route(`${GIS}/**`, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { message: "maintenance" } }),
  }));
  await page.goto("/property-tax/");

  await page.getByLabel("Street address").fill("206 S Main St");
  await page.getByRole("button", { name: "Find parcel" }).click();
  await expect(page.getByText(/county parcel lookup is temporarily unavailable/i)).toBeVisible();

  await fillManualCalculation(page);
  await expect(page.getByRole("region", { name: "Where the estimate goes" })).toBeVisible();
});

test("District 065 manual estimate follows the independent published-rate oracle and clears on input change", async ({ page }) => {
  await page.goto("/property-tax/");
  await fillManualCalculation(page, { district: "065", value: "100000", ratio: "4", homestead: "no" });

  const result = page.getByRole("region", { name: "Where the estimate goes" });
  await expect(result).toContainText("$435.60");
  const countyCard = result.getByText("County operations & debt").locator("..");
  await expect(countyCard).toContainText("$190.80");

  await page.getByLabel("2025 taxable market value").fill("100001");
  await expect(result).toHaveCount(0);
});

test("a 4% Anderson district explains why no estimate is shown", async ({ page }) => {
  await page.goto("/property-tax/");
  await fillManualCalculation(page, { district: "025", value: "100000", ratio: "4", homestead: "no" });

  const result = page.getByRole("region", { name: "Where the estimate goes" });
  await expect(result.getByText(/4% estimate is not available for this district/i)).toBeVisible();
  await expect(page.getByRole("region", { name: "Find your property" }).getByRole("alert")).toContainText("4% estimate is not available for this district");
  await expect(page.getByRole("region", { name: "Find your property" }).getByRole("alert")).toBeFocused();
  await expect(result.locator("[data-viz]")).toHaveCount(0);
});

test("manual entry, the allocation graphic, table, sources, and CSV remain usable at phone width", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/property-tax/");
  await fillManualCalculation(page);

  const result = page.getByRole("region", { name: "Where the estimate goes" });
  await expect(result).toBeVisible();
  await expect(result.getByText(/Assessment used for this estimate/)).toBeVisible();
  await expect(result.locator("[data-viz]").getByRole("button").first()).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`recipient shares stay consistent across the chart, rows and export at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/property-tax/");
    // Hypothetical property; no address or personal county record is used.
    await fillManualCalculation(page, { district: "276", value: "300000" });
    const result = page.getByRole("region", { name: "Where the estimate goes" });
    const rows = result.getByRole("list", { name: "Estimated tax allocation" }).getByRole("button");
    const bar = result.getByRole("group", { name: "All estimated tax recipients" });
    const segments = bar.getByRole("button");
    const labels = ["Taylors fire district", "Greenville County Schools debt", "Greenville County operations", "Greenville County Library System", "Greenville Technical College", "Art museum operations", "Greenville County debt", "Arena district", "Art museum debt"];
    const amounts = [937.2, 582, 567.6, 80.4, 52.8, 14.4, 4.8, 3.6, 1.2];
    await expect(rows).toHaveCount(labels.length);
    await expect(segments).toHaveCount(labels.length);
    await expect(result).toContainText("$2,244.00");
    const barWidth = await bar.evaluate(el => el.clientWidth);
    for (const [index, label] of labels.entries()) {
      await expect(rows.nth(index).locator("strong")).toHaveText(label);
      await expect(segments.nth(index)).toHaveAccessibleName(new RegExp(label));
      const fill = rows.nth(index).locator("span[style*='width']");
      expect(await fill.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await segments.nth(index).evaluate(el => getComputedStyle(el).backgroundColor));
      const segmentWidth = (await segments.nth(index).boundingBox())!.width;
      expect(Math.abs(segmentWidth - barWidth * amounts[index] / 2244)).toBeLessThan(1);
    }
    const countyColor = await segments.nth(2).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(new Set(await segments.evaluateAll(elements => elements.map(el => getComputedStyle(el).backgroundColor))).size).toBe(labels.length);
    await segments.first().click();
    const fireDetail = result.getByRole("region", { name: "Taylors fire district explained" });
    await expect(fireDetail).toBeVisible();
    await expect(fireDetail).toContainText("medical emergencies");
    await expect(fireDetail.getByRole("link", { name: /Taylors Fire Rescue/ })).toHaveAttribute("href", "https://taylorsfirerescue.org/wp/");
    await expect(rows.first()).toHaveAttribute("aria-expanded", "true");
    // Even the smallest segment is usable by keyboard at its true proportional width.
    await segments.last().focus();
    await page.keyboard.press("Enter");
    await expect(result.getByRole("region", { name: "Art museum debt explained" })).toContainText("roof repairs");
    await expect(rows.last()).toHaveAttribute("aria-expanded", "true");
    await result.getByText("View estimate as a table", { exact: true }).click();
    const tableRows = result.getByRole("table").locator("tbody tr");
    const csvHref = await result.getByRole("link", { name: "Download this estimate (CSV)" }).getAttribute("href");
    const csv = decodeURIComponent(csvHref!.split(",").slice(1).join(","));
    let previousCsvIndex = -1;
    for (const [index, label] of labels.entries()) {
      await expect(tableRows.nth(index).getByRole("rowheader")).toHaveText(label);
      const csvIndex = csv.indexOf(`${label},`);
      expect(csvIndex).toBeGreaterThan(previousCsvIndex);
      previousCsvIndex = csvIndex;
    }
    await page.getByLabel("Is this your primary home?").selectOption("6");
    await page.getByRole("button", { name: "Calculate estimate" }).click();
    await expect(rows.first().locator("strong")).toHaveText("Greenville schools");
    expect(await bar.getByRole("button", { name: /Greenville County operations:/ }).evaluate(el => getComputedStyle(el).backgroundColor)).toBe(countyColor);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByLabel("2025 taxable market value").fill("0");
    await page.getByRole("button", { name: "Calculate estimate" }).click();
    await expect(result).toContainText("No payable tax in this estimate");
    await expect(segments).toHaveCount(0);
    await expect(rows).toHaveCount(labels.length);
  });
}

for (const missing of ["assessmentRatio", "homestead"] as const) {
  test(`a county record missing ${missing} opens the details without guessing an estimate`, async ({ page }) => {
    await mockCountyLookup(page, { record: {
      pin: "0059000400201", taxYear: 2025, receipt: "123456", item: "01",
      district: "065", taxableMarketValue: 100000, assessmentClass: "LR",
      assessmentRatio: 4, homestead: false, taxes: 1234.56, [missing]: null,
    } });
    await page.goto("/property-tax/");
    await page.getByLabel("Street address").fill("0059000400201");
    await page.getByRole("button", { name: "Find parcel" }).click();
    const input = page.getByLabel(missing === "assessmentRatio" ? "Is this your primary home?" : "Homestead exemption (age 65+, disabled or legally blind)");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(page.getByRole("region", { name: "Where the estimate goes" })).toHaveCount(0);
    await input.selectOption(missing === "assessmentRatio" ? "4" : "no");
    await page.getByRole("button", { name: "Calculate estimate" }).click();
    await expect(page.getByRole("region", { name: "Where the estimate goes" })).toContainText("$435.60");
  });
}

for (const afterEstimate of [false, true]) {
  test(`clearing an address ${afterEstimate ? "after the estimate" : "during record retrieval"} removes the property and prevents stale results`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await mockCountyLookup(page, { record: {
      pin: "0059000400201", taxYear: 2025, receipt: "123456", item: "01",
      district: "065", taxableMarketValue: 100000, assessmentClass: "LR",
      assessmentRatio: 4, homestead: false, taxes: 1234.56,
    }, recordDelayMs: afterEstimate ? 0 : 600 });
    await page.goto("/property-tax/");
    const query = page.getByLabel("Street address");
    await query.fill("0059000400201");
    await page.getByRole("button", { name: "Find parcel" }).click();
    if (afterEstimate) await expect(page.getByRole("region", { name: "Where the estimate goes" })).toBeVisible();
    else await expect(page.getByText("Loading 2025 tax record…", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear address or PIN" }).click();
    await expect(query).toHaveValue("");
    await expect(query).toBeFocused();
    if (!afterEstimate) await page.waitForTimeout(700);
    await expect(page.getByRole("button", { name: "Clear address or PIN" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Where the estimate goes" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /View official 2025 county record/ })).toHaveCount(0);
    await expect(page.getByLabel("Tax district")).toBeHidden();
    await expect(page.getByLabel("Tax district")).toHaveValue("");
    await expect(page.getByLabel("2025 taxable market value")).toHaveValue("");
  });
}
