import { expect, test } from "@playwright/test";

/**
 * The plan's Step 8 matrix, as a suite rather than a one-off session.
 *
 * Written down because a verification pass that lives only in a transcript has to be
 * re-done by hand every time, and is therefore not re-done. These are the cross-page
 * properties the whole polish pass could plausibly have broken: a layout that overflows at
 * one width, a page that throws in the console, a keyboard trap, a figure that loses its
 * citation in print.
 */

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
  { name: "320", width: 320, height: 568 },
];

const ROUTES = [
  { path: "/", label: "county overview" },
  { path: "/e/fund.general/?fy=2026", label: "General Fund FY2026" },
  { path: "/e/fund.general/?fy=2025", label: "General Fund FY2025 (budget vs actual)" },
  { path: "/e/fund.general/?fy=2014", label: "General Fund FY2014 (pre-2018)" },
  { path: "/e/dept.sheriff/?fy=2026", label: "long history, two breaks" },
  { path: "/e/dept.indigentdefense/?fy=2004", label: "published zero" },
  { path: "/e/fund.special-revenue/?fy=2026", label: "fund group" },
  { path: "/search/", label: "search empty" },
  { path: "/search/?q=roads", label: "search roads" },
  { path: "/search/?q=deputies", label: "search deputies" },
  { path: "/search/?q=zzzznothing", label: "search no results" },
  { path: "/methodology/", label: "methodology" },
  { path: "/corrections/", label: "corrections" },
  { path: "/downloads/", label: "downloads" },
];

test.describe("no horizontal overflow anywhere in the matrix", () => {
  for (const viewport of VIEWPORTS) {
    test(`every route fits at ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const offenders: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route.path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) offenders.push(`${route.label} (${route.path}): ${overflow}px`);
      }
      expect(offenders, `horizontal overflow at ${viewport.name}px`).toEqual([]);
    });
  }
});

test("no console errors on any route", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${page.url()}: ${error.message}`));

  for (const route of ROUTES) {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
  }
  expect(problems).toEqual([]);
});

test("every page has exactly one h1 and one main landmark", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.locator("h1"), `${route.label} h1`).toHaveCount(1);
    await expect(page.getByRole("main"), `${route.label} main`).toHaveCount(1);
  }
});

test("keyboard reaches the year selector and section jumps without a trap", async ({ page }) => {
  await page.goto("/e/fund.general/?fy=2026");

  // Twenty tabs from the top must move focus every time. A trap shows up as the same
  // element holding focus across consecutive presses.
  let previous = "";
  let stuck = 0;
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    const current = await page.evaluate(() => {
      const active = document.activeElement;
      return active ? `${active.tagName}:${active.textContent?.slice(0, 30) ?? ""}` : "";
    });
    stuck = current === previous ? stuck + 1 : 0;
    expect(stuck, `focus stuck on ${current}`).toBeLessThan(3);
    previous = current;
  }
});

test("focus is visible, not suppressed", async ({ page }) => {
  await page.goto("/e/fund.general/?fy=2026");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return null;
    const style = getComputedStyle(active);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(outline).not.toBeNull();
  expect(outline!.outlineStyle, "focused element must not have outline:none").not.toBe("none");
});

test("text reflows at 200% zoom without horizontal scrolling", async ({ page }) => {
  // WCAG 1.4.10. Emulated by halving the viewport, which is what doubling the text does to
  // available columns.
  await page.setViewportSize({ width: 640, height: 512 });
  for (const route of ["/", "/e/fund.general/?fy=2026", "/e/dept.sheriff/?fy=2026"]) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} at 200% zoom`).toBeLessThanOrEqual(1);
  }
});

test("reduced motion is honoured", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/e/fund.general/?fy=2026");

  // The section jump must not force smooth scrolling on a reader who asked for less motion.
  const behaviour = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );
  expect(behaviour).not.toBe("smooth");
});

test("print keeps figures and citations on the pages most likely to be printed", async ({
  page,
}) => {
  for (const route of ["/", "/e/fund.general/?fy=2026", "/e/dept.sheriff/?fy=2026"]) {
    await page.goto(route);
    await page.emulateMedia({ media: "print" });

    await expect(page.getByText(/\$[\d,]{7,}/).first(), `${route} figures`).toBeVisible();
    await expect(page.getByText(/p\.\s?\d+/).first(), `${route} citations`).toBeVisible();
    await expect(page.getByRole("banner"), `${route} masthead`).toBeHidden();
  }
});

test("coverage, caveats and downloads survived the whole pass", async ({ page }) => {
  // The plan's fourth closing question: did any convenience treatment weaken coverage,
  // caveat, status or provenance visibility?
  await page.goto("/");
  const explorer = page.getByTestId("county-money-explorer");
  await explorer.getByRole("button", { name: "Four fund groups" }).click();
  await expect(explorer.getByText(/Countywide revenue is not shown/i).first()).toBeVisible();

  await page.goto("/e/fund.general/?fy=2026");
  await expect(page.locator("#coverage")).toBeVisible();
  await expect(page.getByRole("link", { name: /coverage csv/i })).toBeVisible();

  await page.goto("/e/dept.sheriff/?fy=2026");
  const downloads = page.getByRole("link", { name: /download this series/i });
  await expect(downloads).toHaveCount(2); // comparison figure and full historical ledger
  for (const download of await downloads.all()) await expect(download).toBeVisible();

  await page.goto("/methodology/");
  await expect(page.getByRole("heading", { name: /coverage/i }).first()).toBeVisible();
});
