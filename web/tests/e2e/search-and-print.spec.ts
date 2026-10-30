import { expect, test } from "@playwright/test";

/**
 * Search URL sharing (plan Step 0, bullet 4) and print behaviour (bullet 6).
 *
 * The search assertions fail against the pre-Step-5 build: `SearchClient` reads
 * `useSearchParams()` once into local state and never writes back, so a typed query is not
 * in the address bar and cannot be shared or bookmarked.
 */

test.describe("search is shareable", () => {
  test("typing a query puts it in the URL", async ({ page }) => {
    await page.goto("/search/");
    await page.getByRole("searchbox").or(page.getByRole("textbox")).first().fill("roads");

    await expect(page).toHaveURL(/[?&]q=roads/);
  });

  test("typing does not add one history entry per keystroke", async ({ page }) => {
    await page.goto("/");
    await page.goto("/search/");

    const box = page.getByRole("searchbox").or(page.getByRole("textbox")).first();
    await box.pressSequentially("roads", { delay: 40 });
    await expect(page).toHaveURL(/[?&]q=roads/);

    // Back must return to the page before search, not walk "road", "roa", "ro"…
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("a shared search URL renders its results directly", async ({ page }) => {
    await page.goto("/search/?q=roads");
    const results = page.getByRole("list").filter({ hasText: /road/i }).first();
    await expect(results).toBeVisible();
  });

  test("a result with a published value names amount, year and status", async ({ page }) => {
    await page.goto("/search/?q=roads");

    // Step 5's data contract. Before it, the index carries no values at all.
    const first = page.getByTestId("search-result").first();
    await expect(first).toContainText(/FY\d{4}/);
    await expect(first).toContainText(/\$[\d,]+/);
  });

  test("a historical-only entity does not appear to have a current value", async ({ page }) => {
    // opcat.emergency-medical-services stopped being its own operating category after
    // FY2021. Its last published figure shown bare would read as this year's EMS budget.
    //
    // Targeted by its LINK, not by matching text and taking the first result. Two distinct
    // EMS lines exist — the department (FY2002-FY2026) and the operating category
    // (FY2018-FY2021) — and Step 6 gave them the same display name, since the county's own
    // labels for them differ only in capitalisation. Their relative order is now decided by
    // entity id, so "the first EMS result" is no longer the one this test means.
    await page.goto("/search/?q=emergency medical");

    const result = page.getByTestId("search-result")
      .filter({ has: page.locator('a[href*="opcat.emergency-medical-services"]') });

    await expect(result).toHaveCount(1);
    await expect(result).toContainText(/Latest published: FY20\d\d/);
    await expect(result).not.toContainText("FY2026 ·");
  });

  test("the two EMS lines stay distinguishable despite sharing a display name", async ({
    page,
  }) => {
    // The documented consequence of Step 6, pinned rather than left implicit. Giving the
    // department and the operating category the same resident-facing name is correct —
    // the county calls them the same thing — but the reader must still be able to tell
    // which is which, and the active-year range plus the preview year do that.
    await page.goto("/search/?q=emergency medical");

    const results = page.getByTestId("search-result").filter({ hasText: /emergency medical/i });
    await expect.poll(() => results.count()).toBeGreaterThanOrEqual(2);

    const texts = await results.allInnerTexts();
    const distinct = new Set(texts.map((text) => text.replace(/\s+/g, " ").trim()));
    expect(distinct.size, "two EMS results must not render identically").toBe(texts.length);
  });

  test("same-named Emergency Management and GIS results state what kind of line they are", async ({
    page,
  }) => {
    await page.goto("/search/?q=emergency management");
    const emergency = page.getByTestId("search-result").filter({ hasText: /emergency management/i });
    await expect(emergency).toHaveCount(3);
    const emergencyText = (await emergency.allInnerTexts()).join(" ").toLowerCase();
    expect(emergencyText).toContain("department");
    expect(emergencyText).toContain("category total");
    expect(emergencyText).toContain("budget overview line");

    await page.goto("/search/?q=geographic information systems");
    const gis = page.getByTestId("search-result")
      .filter({ hasText: /geographic information systems/i });
    await expect(gis).toHaveCount(2);
    const gisText = await gis.allInnerTexts();
    expect(gisText.some((text) => text.includes("FY2002–FY2019"))).toBe(true);
    expect(gisText.some((text) => text.includes("FY2020–FY2027"))).toBe(true);
  });

  test("overlapping Planning and Code Compliance results name different parent categories", async ({
    page,
  }) => {
    await page.goto("/search/?q=planning and code compliance");
    const planning = page.getByTestId("search-result")
      .filter({ hasText: /planning and code compliance/i });
    await expect(planning).toHaveCount(2);
    const parents = await planning.getByTestId("parent-category").allInnerTexts();
    expect(parents).toEqual(expect.arrayContaining([
      expect.stringContaining("Community Planning and Development"),
      expect.stringContaining("Other Services"),
    ]));
  });

  test("unbounded entities never render a malformed empty fiscal-year range", async ({ page }) => {
    await page.goto("/search/?q=total budget");

    // budget.total has null active bounds by design. Pin that the query actually found the
    // intended result before using it to exercise the null-rendering branch.
    const totalBudget = page.getByTestId("search-result")
      .filter({ has: page.locator('a[href*="budget.total"]') });
    await expect(totalBudget).toHaveCount(1);
    await expect(totalBudget.getByTestId("active-year-range")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("FY–FY");

    const ranges = page.getByTestId("active-year-range");
    for (const text of await ranges.allInnerTexts()) {
      expect(text.trim()).toMatch(/^FY\d{4}–FY\d{4}$/);
    }
  });

  test("parallel statuses are shown separately, never merged", async ({ page }) => {
    // fin.gf.transfers-out publishes FY2026 twice: as an adopted amount and as a signed
    // financing line. Cold review R3 — the preview must not silently choose one.
    await page.goto("/search/?q=transfers out");

    const result = page.getByTestId("search-result")
      .filter({ hasText: /transfers out/i })
      .first();
    await expect(result).toContainText(/Adopted/);
    await expect(result).toContainText(/Financing/);
  });

  test("ranking is unchanged — roads still returns its three distinct results", async ({
    page,
  }) => {
    // The plan forbids a silent ranking change. Adding values to the index must not
    // reorder anything, so this pins the shape of a known query.
    await page.goto("/search/?q=roads");
    const links = page.getByTestId("search-result").getByRole("link");
    await expect.poll(() => links.count()).toBeGreaterThanOrEqual(3);
    const names = await links.allInnerTexts();
    expect(names.join(" | ")).toMatch(/road/i);
  });

  test("no results still explains coverage", async ({ page }) => {
    // The zero-result state is the point of highest damage for a stale coverage claim: a
    // reader has already failed to find the term and is deciding whether to stop looking.
    await page.goto("/search/?q=zzzznothing");
    await expect(page.getByText(/Nothing here matches that/i)).toBeVisible();
    await expect(page.getByText(/Special Revenue and Debt Service money-in summaries from FY2010/i))
      .toBeVisible();
    await expect(page.getByText(/It is never a claim that the county did not publish it/i))
      .toBeVisible();
    await expect(page.getByText(/revenue for the special revenue.*is not here/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /what is and is not covered/i })).toBeVisible();
  });
});

test.describe("print", () => {
  test("site and in-page navigation are hidden, figures and citations are not", async ({
    page,
  }) => {
    await page.goto("/e/fund.general/?fy=2026");
    await page.emulateMedia({ media: "print" });

    const yearNav = page.getByRole("navigation", { name: /fiscal year/i });
    await expect(yearNav).toBeHidden();

    // The numbers and where they came from must survive; a printout that drops its
    // citations is exactly how a figure from this site gets quoted with no source.
    // Citations render as "p.35", not "page 35".
    await expect(page.getByText(/\$[\d,]{9,}/).first()).toBeVisible();
    await expect(page.getByText(/p\.\s?\d+/).first()).toBeVisible();
  });

  test("the masthead is omitted from print", async ({ page }) => {
    await page.goto("/");

    // Assert the masthead EXISTS on screen before asserting it is hidden in print.
    //
    // Without this first line the test is vacuous: there is no masthead yet, so
    // `toBeHidden()` passes against a page that has nothing to hide, and it would keep
    // passing if Step 2 shipped a masthead that printed on every page. This repository has
    // a documented history of exactly that failure — a gate that passes because it is
    // checking nothing.
    await expect(page.getByRole("banner")).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner")).toBeHidden();
  });
});

test.describe("related presentations", () => {
  const reciprocalPairs = [
    {
      relationshipId: "related.sr-parks-presentations",
      routes: [
        "/e/fund.sr.parks-recreation-tourism/?fy=2026",
        "/e/use.sr.parks-recreation-tourism/?fy=2026",
      ],
      expectedText: /\$5,035,024[\s\S]*transfers/,
    },
    {
      relationshipId: "related.gf-public-works-presentations",
      routes: [
        "/e/overview.gf.public-works/?fy=2026",
        "/e/opcat.public-works/?fy=2026",
      ],
      expectedText: /\$7,868,053[\s\S]*29\.6%/,
    },
  ];

  for (const pair of reciprocalPairs) {
    for (const [routeIndex, route] of pair.routes.entries()) {
      test(`${pair.relationshipId} links from endpoint ${routeIndex + 1}`, async ({ page }) => {
        await page.goto(route);
        const block = page.locator(
          `[data-relationship-id="${pair.relationshipId}"]`,
        );
        await expect(block).toHaveCount(1);
        await expect(block).toContainText(pair.expectedText);
        await expect(block.getByRole("link").first()).toHaveAttribute(
          "href",
          pair.routes[1 - routeIndex],
        );
        await expect(block.getByRole("link", { name: /Source: FY2026/i })).toBeVisible();
        await expect(block).toContainText(/do not add them together/i);
      });
    }
  }

  test("Road Program is not linked to the broader Public Works outflow category", async ({
    page,
  }) => {
    await page.goto("/e/fund.sr.road-program/?fy=2026");
    await expect(
      page.locator('[data-related-lines="true"] a[href*="use.sr.department-public-works"]'),
    ).toHaveCount(0);
  });
});
