import { expect, test } from "@playwright/test";

/**
 * General Fund orientation and density (plan Step 4).
 *
 * The density gate is the cold review's sixth finding made executable. The plan originally
 * said the page should be "materially shorter", which does not tell an implementer when the
 * work is done; and a whole-page height number would be brittle, since it moves with fonts,
 * caveat counts and how many notes a year carries. So the measurement is component-level:
 * the summary equation, at one specific viewport.
 */

const PHONE = { width: 390, height: 844 };

test.describe("money-out composition", () => {
  test("each share is attached to the line it describes", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2026");

    // The owner's finding: a composition bar rendered after "Transfers out" put its large
    // operations segment directly beneath the small transfers figure, so the picture
    // contradicted the text. The fix is not a relabelled bar — it is no bar.
    const moneyOut = page.locator("#money-out");
    await expect(moneyOut).toBeVisible();

    const operating = moneyOut.getByRole("listitem").filter({ hasText: /operating budget/i }).first();
    const transfers = moneyOut.getByRole("listitem").filter({ hasText: /transfers out/i }).first();

    await expect(operating).toContainText("96.9%");
    await expect(transfers).toContainText("3.1%");

    // And the shares must sum to exactly 100.0 — they are allocated together, not divided
    // independently and left to round to 99.9.
    const shares = (await moneyOut.getByText(/%\s*of money out/i).allInnerTexts())
      .map((text) => Number(text.replace(/[^\d.]/g, "")));
    expect(shares).toHaveLength(2);
    expect(shares[0] + shares[1]).toBeCloseTo(100, 5);
  });

  test("the amounts, statuses, citations and the transfer explanation survive", async ({
    page,
  }) => {
    await page.goto("/e/fund.general/?fy=2026");
    const moneyOut = page.locator("#money-out");

    await expect(moneyOut.getByText(/not a second expense/i)).toBeVisible();
    await expect(moneyOut.getByText(/total general fund budget/i)).toBeVisible();
    await expect(moneyOut.getByText(/p\.\s?\d+/).first()).toBeVisible();
  });

  test("the shares are derived from the amounts on the page, not written in", async ({ page }) => {
    // "Check another year" is not available here: FY2011–FY2025 all have an audited
    // comparison and render the budget-versus-actual branch instead, so FY2026 is the only
    // year that uses this two-line presentation at all. Proving the numbers are derived
    // therefore has to be done within the one year — by recomputing them from the dollar
    // figures the page itself prints. A hardcoded "96.9%" would survive a second-year test
    // that never ran; it cannot survive this one.
    await page.goto("/e/fund.general/?fy=2026");
    const moneyOut = page.locator("#money-out");
    // The "What services does this support?" nav at the end of this section prints its own
    // General Fund total (for its share denominator) plus each linked service's own dollar
    // figure -- none of which are the operating/transfers/total triple this test recomputes
    // from, so its dollar figures are subtracted out (by exact text, respecting duplicate
    // counts) rather than assumed away by DOM position.
    const nav = moneyOut.locator("nav");
    const navDollarCounts = new Map<string, number>();
    for (const text of await nav.getByText(/^\$[\d,]+$/).allInnerTexts()) {
      navDollarCounts.set(text, (navDollarCounts.get(text) ?? 0) + 1);
    }

    const dollars = (await moneyOut.getByText(/^\$[\d,]+$/).allInnerTexts())
      .filter((text) => {
        const remaining = navDollarCounts.get(text) ?? 0;
        if (remaining > 0) {
          navDollarCounts.set(text, remaining - 1);
          return false;
        }
        return true;
      })
      .map((text) => Number(text.replace(/[^\d]/g, "")))
      .filter((value) => value > 0);

    // Operating, transfers out, and the total, largest first.
    const [total, operating, transfersOut] = [...dollars].sort((a, b) => b - a);
    expect(operating + transfersOut).toBe(total);

    const shares = (await moneyOut.getByText(/%\s*of money out/i).allInnerTexts())
      .map((text) => Number(text.replace(/[^\d.]/g, "")));

    expect(shares[0]).toBeCloseTo(Number(((operating / total) * 100).toFixed(1)), 1);
    expect(shares[1]).toBeCloseTo(Number(((transfersOut / total) * 100).toFixed(1)), 1);
  });
});

test.describe("mobile density", () => {
  test("the summary equation fits within 1.5 viewport heights at 390x844", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/e/fund.general/?fy=2026");

    const equation = page.locator("#summary");
    await expect(equation).toBeVisible();

    const box = await equation.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.height,
      `summary equation height at ${PHONE.width}x${PHONE.height}`,
    ).toBeLessThanOrEqual(PHONE.height * 1.5);
  });

  test("compacting the equation drops no figure, citation or explanation", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/e/fund.general/?fy=2026");
    const equation = page.locator("#summary");

    // Every step of the equation still shows its amount and its source. Density is not a
    // licence to drop a citation.
    await expect(equation.getByText(/starting balance/i).first()).toBeVisible();
    await expect(equation.getByText(/money in/i).first()).toBeVisible();
    await expect(equation.getByText(/money out/i).first()).toBeVisible();
    await expect(equation.getByText(/ending/i).first()).toBeVisible();
    await expect(equation.getByText(/p\.\s?\d+/).first()).toBeVisible();

    // The explanation of the planned draw is restated below the equation, which is the
    // reason the per-card repetitions can go.
    await expect(page.getByText(/planned use of fund balance/i).first()).toBeVisible();
  });

  test("year and section chips never wrap into a wall of rows", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/e/fund.general/?fy=2026");

    // The plan's gate: each control uses no more than two visible rows, or an intentional
    // scrolling presentation. Measured by counting DISTINCT vertical positions among a
    // control's chips — one row of chips shares one `y`. Twenty-five year chips wrapping
    // would produce five or six.
    const fiscalSelect = page.getByRole("combobox", { name: "Choose fiscal year" });
    await expect(fiscalSelect).toBeVisible();
    await expect(fiscalSelect).toHaveValue("2026");
    for (const label of [/on this page/i]) {
      const links = page.getByRole("navigation", { name: label }).getByRole("link");
      const count = await links.count();
      expect(count, `${label} should offer links`).toBeGreaterThan(0);

      const tops = new Set<number>();
      for (let index = 0; index < count; index += 1) {
        const box = await links.nth(index).boundingBox();
        if (box) tops.add(Math.round(box.y));
      }

      // The fiscal-year control has one row per coverage group; the section control has one.
      const maxRows = /fiscal/.test(label.source) ? 3 : 2;
      expect(tops.size, `${label} occupies ${tops.size} rows of chips`)
        .toBeLessThanOrEqual(maxRows);
    }
  });

  test("FY2025's denser budget-versus-actual section stays legible at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/e/fund.general/?fy=2025");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow at 320px").toBeLessThanOrEqual(1);
    await expect(page.getByRole("heading", { name: "The plan and the year-end result" })).toBeVisible();
  });
});

test.describe("section jump", () => {
  test("every jump link resolves to a section that exists on the page", async ({ page }) => {
    // A link to a section this year does not render silently does nothing when clicked.
    for (const route of ["/e/fund.general/?fy=2026", "/e/fund.general/?fy=2025", "/e/fund.general/?fy=2014"]) {
      await page.goto(route);
      const nav = page.getByRole("navigation", { name: /on this page/i });
      if ((await nav.count()) === 0) continue;

      for (const href of await nav.getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      )) {
        const id = href.replace("#", "");
        await expect(page.locator(`#${id}`), `${route} -> ${href}`).toHaveCount(1);
      }
    }
  });

  test("jumping leaves the target heading clear of the top edge", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/e/fund.general/?fy=2026");

    await page.getByRole("navigation", { name: /on this page/i })
      .getByRole("link", { name: /^money out$/i })
      .click();

    const box = await page.locator("#money-out").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y, "target must not sit flush against or above the viewport top")
      .toBeGreaterThanOrEqual(0);
  });

  test("FY2026 offers the transfers section and FY2014 does not", async ({ page }) => {
    await page.goto("/e/fund.general/?fy=2026");
    await expect(
      page.getByRole("navigation", { name: /on this page/i }).getByRole("link", { name: /transfers/i }),
    ).toHaveCount(1);

    await page.goto("/e/fund.general/?fy=2014");
    const nav = page.getByRole("navigation", { name: /on this page/i });
    if ((await nav.count()) > 0) {
      await expect(nav.getByRole("link", { name: /^transfers$/i })).toHaveCount(0);
    }
  });
});
