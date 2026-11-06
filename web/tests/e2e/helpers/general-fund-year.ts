import { expect, type Page } from "@playwright/test";

/**
 * Open a General Fund year and wait until that year is the one on the page.
 *
 * A year other than the latest first renders the latest year, then swaps in the requested
 * one after hydration. A test that reads the page before the swap measures the wrong year:
 * on 2026-10-31 CI read FY2026 links, figures and controls mid-swap and failed four tests
 * that pass locally. The General Fund content's own year select carries the year it is
 * showing. It is present at every width (hidden above `sm`), so the wait works on desktop
 * and phone viewports alike.
 */
export async function gotoGeneralFundYear(page: Page, fy: number) {
  await page.goto(`/e/fund.general/?fy=${fy}`);
  await expect(page.locator('select[aria-label="Choose fiscal year"]')).toHaveValue(String(fy));
}
