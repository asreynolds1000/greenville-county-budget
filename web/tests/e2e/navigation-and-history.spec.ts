import { expect, test } from "@playwright/test";

/**
 * Reachability and mobile legibility (plan Step 0, bullets 2–3 and 5).
 *
 * Two of these fail against the pre-Step-3/4 build: sixteen General Fund years exist as
 * routes but no control reaches them, and the entity-history source column sits outside a
 * 320px viewport behind `overflow-x-auto` with no scroll affordance.
 */

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };

test.describe("General Fund year navigation", () => {
  test("every supported year is reachable from the year control", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2026");

    const yearNav = page.getByRole("navigation", { name: /fiscal year/i });
    await expect(yearNav).toBeVisible();

    // The route supports FY2002–FY2027. A year that exists as a page but appears in no
    // control is unreachable by anything except a hand-typed URL.
    const links = yearNav.getByRole("link");
    const labels = await links.allInnerTexts();
    const reachable = new Set(labels.map((text) => text.trim()));

    const missing: string[] = [];
    for (let year = 2002; year <= 2027; year += 1) {
      if (!reachable.has(`FY${year}`)) missing.push(`FY${year}`);
    }
    expect(missing, `years with a route but no control entry: ${missing.join(", ")}`)
      .toEqual([]);
  });

  test("each supported year appears in exactly one group", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2026");
    const yearNav = page.getByRole("navigation", { name: /fiscal year/i });
    const labels = (await yearNav.getByRole("link").allInnerTexts()).map((t) => t.trim());
    const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);
    expect(duplicates, `a year listed twice reads as two different things: ${duplicates}`)
      .toEqual([]);
  });

  test("the current year is marked for assistive technology", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2024");
    const current = page.getByRole("navigation", { name: /fiscal year/i })
      .locator("[aria-current='page']");
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("FY2024");
  });

  test("year controls meet a 44px touch target on mobile", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/e/fund.general/?fy=2026");

    const control = page.getByRole("combobox", { name: "Choose fiscal year" });
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height, "year control height at 390px").toBeGreaterThanOrEqual(44);
  });
});

test.describe("entity history on a phone", () => {
  test("a history row shows year, status, amount and source without sideways scrolling", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/e/dept.sheriff/?fy=2026");

    // The source is the whole point of this site, and it is the field that currently falls
    // off the right edge inside `overflow-x-auto`.
    //
    // Located by its CONTENT (the printed page citation, "p.57"), not by a test id. A test
    // id would make this fail today merely because the marker does not exist yet, which
    // would prove nothing about the layout and would go green the moment an attribute was
    // added. Content-located, it fails today for the actual defect and can only be made to
    // pass by moving the field into view.
    //
    // Scoped to the history SECTION, and to whichever presentation is actually visible at
    // this width. Two earlier versions of this locator were wrong in instructive ways:
    // unscoped, it matched the page summary's citation near the top, which is inside the
    // viewport, so it passed while the defect was still on the page; scoped to the <table>,
    // it kept passing an element that Step 3 deliberately hides on phones.
    const history = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "History" }) });
    await expect(history).toHaveCount(1);

    const source = history.getByText(/p\.\s?\d+/).filter({ visible: true }).first();
    await expect(source).toBeVisible();

    const box = await source.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.x + box!.width,
      "the source citation's right edge must sit inside a 320px viewport",
    ).toBeLessThanOrEqual(NARROW.width);
  });

  test("the page itself never scrolls horizontally at 320px", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/e/dept.sheriff/?fy=2026");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
  });

  test("history is exposed once, not twice, to assistive technology", async ({ page }) => {
    // The constraint is about the ACCESSIBILITY tree, not the DOM. Two presentations may
    // exist in the markup provided only one is ever announced — `display: none` removes a
    // subtree from the accessibility tree, which is exactly how the responsive swap works.
    // So this counts VISIBLE occurrences of a distinctive per-row string; counting DOM
    // nodes would fail a correct implementation, and counting containers would pass any
    // markup shape at all.
    for (const viewport of [NARROW, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/e/dept.sheriff/?fy=2026");

      await expect(
        page.getByText(/^FY2019$/).filter({ visible: true }),
        `visible FY2019 rows at ${viewport.width}px`,
      ).toHaveCount(1);
    }
  });

  test("the ledger and the table say the same thing about a break", async ({ page }) => {
    // Both presentations render from one buildRows() result, so a break cannot appear in
    // one and not the other — and the phone must not get an abridged warning.
    const readBreak = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/e/dept.sheriff/?fy=2026");
      return (await page.getByText(/employee benefit/i).filter({ visible: true }).first().innerText())
        .replace(/\s+/g, " ")
        .trim();
    };

    expect(await readBreak(320)).toBe(await readBreak(1440));
  });

  test("comparability breaks stay between the rows they separate", async ({ page }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");
    // FY2006 benefits reallocation and the FY2013 break both apply to this entity.
    //
    // `.filter({ visible: true })` is load-bearing now that two presentations exist: the
    // mobile ledger comes first in the DOM, so a bare `.first()` picks the hidden copy at
    // desktop widths and fails against a perfectly correct page.
    await expect(page.getByText(/employee benefit/i).filter({ visible: true }).first())
      .toBeVisible();
  });
});

test.describe("published zero versus unpublished", () => {
  test("a published zero reads as a number and an absent year says so", async ({ page }) => {
    // dept.indigentdefense publishes a real $0 for FY2004 and FY2005, and has no entry at
    // all for FY2006–07. Both appear in the same history table, which is what makes this
    // the right place to assert the distinction: the two states must not render alike.
    //
    // Passes today. Pinned because every step in this pass rewrites a surface that shows
    // amounts, and collapsing "nothing published" into "$0" would invent county spending.
    // Checked at BOTH widths, because after Step 3 these are two separate renderings and a
    // regression could land in either one alone.
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/e/dept.indigentdefense/?fy=2004");

      await expect(page.getByText("$0").filter({ visible: true }).first(), `$0 at ${width}px`)
        .toBeVisible();
      await expect(
        page.getByText(/Not published/i).filter({ visible: true }).first(),
        `absent year at ${width}px`,
      ).toBeVisible();
    }
  });
});
