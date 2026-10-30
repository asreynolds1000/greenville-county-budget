import { expect, test, type Page } from "@playwright/test";

/**
 * After ANY navigation, the document title names the page the reader is on — and on an
 * entity page it names the fiscal year being displayed. Both halves bind.
 *
 * `entity-title-year.spec.ts` covers the second half within one entity page. This spec is the
 * matrix around it: every kind of entity page (a deferred fund, an ordinary entity, with and
 * without `?fy`, and the uncovered-year path) leaving for every site destination, plus year
 * changes, rapid changes, back/forward, and entity-to-entity links. It exists because a
 * MutationObserver that keeps the year-qualified title alive on an entity page survived a
 * client-side navigation and wrote "Sheriff — FY2020" over the Search page's title. That
 * defect was invisible to typecheck, lint, every unit test and every other browser spec.
 *
 * Every cell asserts the SETTLED title, not the first matching one: `toHaveTitle` polls until
 * it matches, so a title that is right for a frame and then overwritten would pass it. The
 * deferred fund panel resolves around 400ms after hydration and is the known re-application
 * point, so the settle window is comfortably past that.
 */
const SITE = "Greenville County Budget Explorer";

const DESTINATIONS = [
  { path: "/", title: SITE, link: 'header nav a[href="/"]' },
  { path: "/property-tax/", title: "Greenville County property tax estimate · Budget Explorer", link: 'header nav a[href="/property-tax/"]' },
  { path: "/compare/", title: `Compare spending across years · ${SITE}`, link: 'header nav a[href="/compare/"]' },
  { path: "/search/", title: `Search · ${SITE}`, link: 'header nav a[href="/search/"]' },
  { path: "/methodology/", title: `Methodology and coverage · ${SITE}`, link: 'footer a[href="/methodology/"]' },
] as const;

const ORIGINS = [
  { name: "a deferred fund with ?fy", url: "/e/fund.general/?fy=2020", title: `General Fund — FY2020 · ${SITE}`, year: "2020" },
  { name: "an ordinary entity with ?fy", url: "/e/dept.sheriff/?fy=2020", title: `Sheriff — FY2020 · ${SITE}`, year: "2020" },
  { name: "a deferred fund on its latest year", url: "/e/fund.general/", title: `General Fund — FY2027 · ${SITE}`, year: "2027" },
  { name: "an ordinary entity on its latest year", url: "/e/dept.sheriff/", title: `Sheriff — FY2027 · ${SITE}`, year: "2027" },
  // Out of range: year === null, so the explorer installs no observer. Its server-rendered
  // title is the latest year, which the existing spec accepts as "not asserting FY1999".
  { name: "an uncovered year", url: "/e/fund.general/?fy=1999", title: `General Fund — FY2027 · ${SITE}`, year: "unavailable" },
] as const;

const SETTLE_MS = 800;

/** The title must match now AND still match after everything deferred has resolved. */
async function expectSettledTitle(page: Page, title: string) {
  await expect(page).toHaveTitle(title);
  await page.waitForTimeout(SETTLE_MS);
  expect(await page.title(), `title after ${SETTLE_MS}ms settle`).toBe(title);
}

async function openEntity(page: Page, origin: (typeof ORIGINS)[number]) {
  await page.goto(origin.url);
  await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", origin.year);
  await expectSettledTitle(page, origin.title);
}

test.describe("destination titles are what a hard load gives them (positive control)", () => {
  for (const destination of DESTINATIONS) {
    test(`${destination.path} hard-loaded`, async ({ page }) => {
      await page.goto(destination.path);
      await expectSettledTitle(page, destination.title);
    });
  }
});

test.describe("leaving an entity page: the destination keeps its own title", () => {
  for (const origin of ORIGINS) {
    for (const destination of DESTINATIONS) {
      test(`${origin.name} -> ${destination.path}, then back, then forward`, async ({ page }) => {
        await openEntity(page, origin);

        await page.locator(destination.link).first().click();
        await page.waitForURL(destination.path);
        await expectSettledTitle(page, destination.title);

        await page.goBack();
        await page.waitForURL(origin.url);
        await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", origin.year);
        await expectSettledTitle(page, origin.title);

        await page.goForward();
        await page.waitForURL(destination.path);
        await expectSettledTitle(page, destination.title);
      });
    }
  }
});

test.describe("year changes inside an entity page", () => {
  for (const origin of [ORIGINS[0], ORIGINS[1]]) {
    const name = origin.title.split(" — ")[0];
    test(`${origin.name}: one change, rapid changes, back and forward, then leaving`, async ({ page }) => {
      await openEntity(page, origin);
      const control = page.getByRole("combobox", { name: "Explore fiscal year" });

      await control.selectOption("2014");
      await expectSettledTitle(page, `${name} — FY2014 · ${SITE}`);

      // Several selections faster than any deferred panel can resolve. Each pushes a history
      // entry; only the last one may win the title.
      await control.selectOption("2010");
      await control.selectOption("2012");
      await control.selectOption("2015");
      await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2015");
      await expectSettledTitle(page, `${name} — FY2015 · ${SITE}`);

      await page.goBack();
      await expectSettledTitle(page, `${name} — FY2012 · ${SITE}`);
      await page.goBack();
      await expectSettledTitle(page, `${name} — FY2010 · ${SITE}`);
      await page.goForward();
      await expectSettledTitle(page, `${name} — FY2012 · ${SITE}`);

      // A year chosen by the control rather than by the URL, then a soft navigation away.
      await page.locator('header nav a[href="/search/"]').click();
      await page.waitForURL("/search/");
      await expectSettledTitle(page, `Search · ${SITE}`);

      await page.goBack();
      await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2012");
      await expectSettledTitle(page, `${name} — FY2012 · ${SITE}`);
    });
  }
});

test.describe("entity to entity links are document navigations", () => {
  test("a Sheriff page's link to the General Fund lands on the General Fund's own year", async ({ page }) => {
    await openEntity(page, ORIGINS[1]);
    // The FY2020 panel links to the fund's own FY2020; each year's panel carries its own links.
    await page.locator('a[href="/e/fund.general/?fy=2020"]').first().click();
    await page.waitForURL("/e/fund.general/?fy=2020");
    await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2020");
    await expectSettledTitle(page, `General Fund — FY2020 · ${SITE}`);

    await page.goBack();
    await page.waitForURL(ORIGINS[1].url);
    await expectSettledTitle(page, ORIGINS[1].title);
  });
});

test.describe("hard load and soft arrival at the same entity URL agree", () => {
  test("arriving at ?fy=2020 by Back reads the same as loading it", async ({ page }) => {
    await openEntity(page, ORIGINS[1]);
    const hardLoaded = await page.title();
    expect(hardLoaded).toBe(ORIGINS[1].title);

    await page.locator('header nav a[href="/compare/"]').click();
    await page.waitForURL("/compare/");
    await expectSettledTitle(page, `Compare spending across years · ${SITE}`);

    await page.goBack();
    await page.waitForURL("/e/dept.sheriff/?fy=2020");
    await expectSettledTitle(page, hardLoaded);
  });

  // The static server, like Next's own dotted-path hrefs (napkin, 2026-09-11), also answers
  // the entity URL without its trailing slash. A title guard keyed on the location must not
  // mistake that for "not on this page" and leave the latest year's title over FY2020 figures.
  test("a hard load without the trailing slash still names its year", async ({ page }) => {
    await page.goto("/e/dept.sheriff?fy=2020");
    await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2020");
    await expectSettledTitle(page, `Sheriff — FY2020 · ${SITE}`);
  });
});
