import { expect, test } from "@playwright/test";

test("the property-tax result continues into FY2026 county services without allocating personal dollars", async ({ page }) => {
  await page.goto("/property-tax/");
  await page.getByText("Review or change details", { exact: true }).click();
  await page.getByLabel("Tax district").selectOption("065");
  await page.getByLabel("2025 taxable market value").fill("300000");
  await page.getByLabel("Is this your primary home?").selectOption("4");
  await page.getByLabel("Homestead exemption (age 65+, disabled or legally blind)").selectOption("no");
  await page.getByRole("button", { name: "Calculate estimate" }).click();

  const result = page.getByRole("region", { name: "Where the estimate goes" });
  await expect(result).toBeVisible();
  await expect(result.getByText("County operations & debt", { exact: true })).toBeVisible();

  const bridge = page.getByRole("region", { name: "What county services does this support?" });
  await expect(bridge).toContainText("tax year 2025");
  await expect(bridge).toContainText("fees, aid, transfers, and other funding");
  await expect(bridge).toContainText("does not trace an individual’s dollars to a department or service");
  await expect(bridge).toContainText("is not county spending");
  await expect(bridge).toContainText("FY2026");
  await expect(bridge).not.toContainText(/unknown|unavailable/i);

  await expect(bridge.getByRole("link", { name: /Explore FY2026 General Fund services/ }))
    .toHaveAttribute("href", "/e/fund.general/?fy=2026#money-out");
  await expect(bridge.getByRole("link", { name: "Emergency medical services (EMS)" }))
    .toHaveAttribute("href", "/e/dept.emergencymedicalservices/?fy=2026");
  await expect(bridge.getByRole("link", { name: "Sheriff and deputies" }))
    .toHaveAttribute("href", "/e/dept.sheriff/?fy=2026");
  await expect(bridge.getByRole("link", { name: "Roads and paving" }))
    .toHaveAttribute("href", "/services/roads/");

  const bridgeHrefs = await bridge.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  // Year selection became a query param when the per-year routes were consolidated, so a
  // blanket no-"?" rule now contradicts the href assertions above. The guarantee this
  // protects is that NO resident input reaches an onward link; that is asserted directly,
  // and more strictly: `fy` is the only key permitted at all.
  const queryKeys = bridgeHrefs.flatMap((href) => {
    const q = href.includes("?") ? href.slice(href.indexOf("?") + 1).split("#")[0] : "";
    return q ? q.split("&").map((pair) => pair.split("=")[0]) : [];
  });
  expect(queryKeys.every((key) => key === "fy")).toBe(true);
  expect(bridgeHrefs.every((href) => !/pin|address|market|taxable|district/i.test(href))).toBe(true);

  await bridge.getByRole("link", { name: /Explore FY2026 General Fund services/ }).click();
  await expect(page).toHaveURL(/\/e\/fund.general\/\?fy=2026#money-out$/);
  const services = page.getByRole("navigation", { name: "Explore FY2026 General Fund services" });
  await services.getByRole("link", { name: "Ambulance services" }).click();
  await expect(page).toHaveURL(/\/e\/dept.emergencymedicalservices\/\?fy=2026$/);
  await expect(page.getByRole("heading", { name: "What the FY2026 EMS budget covers" })).toBeVisible();
});
