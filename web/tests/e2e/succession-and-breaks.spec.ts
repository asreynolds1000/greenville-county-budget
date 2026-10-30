import { expect, test } from "@playwright/test";

/**
 * Following a line across a rename, and being told where it is NOT safe to.
 *
 * These two things have to ship together. A successor link without a break note invites the
 * reader to treat two eras as one trend; a break note without a link tells them the trail
 * ends when it does not. The county renames departments and regroups them, and the site now
 * says both what continues and what is not comparable.
 */

test.describe("succession links", () => {
  test("a renamed line points forward, and its successor points back", async ({ page }) => {
    await page.goto("/e/dept.engsouthernbureau/?fy=2013");
    // The <p>, not the bold "Continues as" label inside it — the link and the evidence
    // are siblings of that span, not children.
    const forward = page.locator("p").filter({ hasText: /continues as/i });
    await expect(forward).toBeVisible();
    await expect(forward.getByRole("link", { name: /engineering - southern bureau/i }))
      .toBeVisible();

    await page.goto("/e/dept.engineeringsouthernbureau/?fy=2014");
    const back = page.locator("p").filter({ hasText: /continues from/i });
    await expect(back).toBeVisible();
    await expect(back.getByRole("link", { name: /eng\. - southern bureau/i })).toBeVisible();
  });

  test("the link actually resolves", async ({ page }) => {
    await page.goto("/e/dept.engsouthernbureau/?fy=2013");
    await page.locator("p").filter({ hasText: /continues as/i })
      .getByRole("link", { name: /engineering - southern bureau/i })
      .click();
    await expect(page).toHaveURL(/dept\.engineeringsouthernbureau/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Engineering - Southern Bureau/i);
  });

  test("the claim carries its evidence, not just an assertion", async ({ page }) => {
    // "These are the same line" is exactly the sort of claim that should show its working:
    // the county's own printed labels either side, and what the figure did across the join.
    await page.goto("/e/dept.matchingfundgrants/?fy=2019");
    const link = page.locator("p").filter({ hasText: /continues as/i });
    await expect(link).toContainText(/MATCHING FUND GRANTS/);
    await expect(link).toContainText(/Matching Funds\/Grants/);
    await expect(link).toContainText(/200,000/);
  });

  test("an entity with no rename shows no succession line", async ({ page }) => {
    // Guards against the block rendering empty chrome on all 180 pages.
    await page.goto("/e/dept.sheriff/?fy=2026");
    await expect(page.locator("p").filter({ hasText: /continues as|continues from/i }))
      .toHaveCount(0);
  });
});

test.describe("comparability breaks", () => {
  test("the FY2016 engineering absorption appears on engineering only", async ({ page }) => {
    // Entity-scoped. A `series`-scoped note would split every department at FY2016, where
    // nothing else changed — noise that trains readers to ignore break markers.
    await page.goto("/e/dept.engineering/?fy=2016");
    await expect(page.getByText(/absorbed its two bureaus/i).filter({ visible: true }).first())
      .toBeVisible();

    for (const other of ["/e/dept.sheriff/?fy=2016", "/e/dept.coroner/?fy=2016"]) {
      await page.goto(other);
      await expect(page.getByText(/absorbed its two bureaus/i), other).toHaveCount(0);
    }
  });

  test("the engineering break states the arithmetic that proves it", async ({ page }) => {
    await page.goto("/e/dept.engineering/?fy=2016");
    const note = page.getByText(/absorbed its two bureaus/i).filter({ visible: true }).first();
    const block = page.locator("li,td").filter({ has: note }).first();

    // The 475% jump is the thing a reader would otherwise take at face value, and the
    // FY2015 three-line sum is what shows it did not happen.
    await expect(block).toContainText(/970,760/);
    await expect(block).toContainText(/5,586,265/);
    await expect(block).toContainText(/5,553,311/);
  });

  test("the FY2024 regrouping applies to departments, not revenue lines", async ({ page }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");
    await expect(page.getByText(/regrouped again in FY2024/i).filter({ visible: true }).first())
      .toBeVisible();

    await page.goto("/e/rev.property-taxes/?fy=2024");
    await expect(page.getByText(/regrouped again in FY2024/i)).toHaveCount(0);
  });
});

test.describe("the FY2022 position adjustment", () => {
  test("says what CSLFRF is and why it is not money in", async ({ page }) => {
    await page.goto("/e/balance.gf.revenue-replacement/?fy=2022");

    await expect(page.getByText(/Coronavirus State and Local Fiscal Recovery Funds/i)).toBeVisible();
    await expect(page.getByText(/American Rescue Plan Act/i)).toBeVisible();

    // The two things a reader needs: why it sits in position rather than money in, and the
    // arithmetic it makes work.
    await expect(page.getByText(/between the beginning and ending fund balance/i)).toBeVisible();
    await expect(page.getByText(/73,174,639/)).toBeVisible();
  });

  test("the General Fund page carries the same explanation, not a generic one", async ({
    page,
  }) => {
    await page.goto("/e/fund.general/?fy=2022");
    const adjustment = page.getByText(/Estimated Revenue Replacement/i).first();
    await expect(adjustment).toBeVisible();
    await expect(page.getByText(/federal pandemic recovery money/i).first()).toBeVisible();
  });
});

test.describe("lines the county printed under more than one label", () => {
  test("the series is continuous, with no false unpublished gap", async ({ page }) => {
    // dept.medicalexamienr used to be its own entity because the FY2020-21 book misspelled
    // the label. That split one history in two and made the canonical page report FY2020
    // and FY2021 as "Not published" for years the county HAD published.
    await page.goto("/e/dept.medicalexaminer/?fy=2026");

    const history = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Source" }),
    });
    for (const year of ["FY2019", "FY2020", "FY2021", "FY2022"]) {
      await expect(
        history.getByRole("row").filter({ hasText: new RegExp(`^${year}`) }).first(),
        `${year} row`,
      ).toBeVisible();
    }
    await expect(history.getByText(/Not published/)).toHaveCount(0);
  });

  test("the label the county actually printed is shown on the rows where it differs", async ({
    page,
  }) => {
    // Merging the entity must not quietly edit the source. A reader has to be able to see
    // that the FY2020-21 book said "Medical Examienr".
    await page.goto("/e/dept.medicalexaminer/?fy=2026");
    const history = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Source" }),
    });

    const fy2020 = history.getByRole("row").filter({ hasText: /^FY2020/ }).first();
    await expect(fy2020).toContainText(/printed as .Medical Examienr./);

    const fy2022 = history.getByRole("row").filter({ hasText: /^FY2022/ }).first();
    await expect(fy2022).not.toContainText(/printed as/);
  });

  test("case and OCR word-splitting alone do not trigger the note", async ({ page }) => {
    // Every pre-2020 row is printed in capitals, and some carry OCR spaces. Flagging those
    // would put "printed as" on most rows of most tables and train readers to skip it.
    await page.goto("/e/dept.sheriff/?fy=2026");
    const history = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Source" }),
    });
    await expect(history.getByText(/printed as/)).toHaveCount(0);
  });

  test("Public Works Administration keeps one continuous history across both relabels", async ({
    page,
  }) => {
    await page.goto("/e/dept.publicworksadministration/?fy=2026");
    const history = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Source" }),
    });
    await expect(history.getByText(/Not published/)).toHaveCount(0);
    await expect(
      history.getByRole("row").filter({ hasText: /^FY2021/ }).first(),
    ).toContainText(/printed as .Public Works Administrator./);
  });
});

test.describe("unusual movements that have no stated reason", () => {
  test("the marked year carries a footnote mark and the note sits at the foot", async ({
    page,
  }) => {
    await page.goto("/e/dept.employeebenefitfund/?fy=2026");

    const history = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Source" }),
    });
    // FY2020 and FY2021 are the spike years and carry the mark; FY2019 does not.
    await expect(history.getByRole("row").filter({ hasText: /^FY2020/ }).first()
      .getByRole("link", { name: /^Note 1/ })).toBeVisible();
    await expect(history.getByRole("row").filter({ hasText: /^FY2019/ }).first()
      .getByRole("link", { name: /^Note/ })).toHaveCount(0);

    const footnotes = page.getByRole("region", { name: /notes on these figures/i })
      .or(page.locator("section").filter({ hasText: /Notes on these figures/i }));
    await expect(footnotes.first()).toContainText(/no stated reason/i);
  });

  test("it does not claim the county gave no reason, only that we did not find one", async ({
    page,
  }) => {
    // Calibration: this site has not extracted the county's narrative sections, so
    // asserting the report is silent would overclaim.
    await page.goto("/e/dept.employeebenefitfund/?fy=2026");
    await expect(page.getByRole("region", { name: "Notes on these figures" }).getByText(/not its narrative sections/i)).toBeVisible();
    await expect(page.getByRole("region", { name: "Notes on these figures" }).getByText(/The amounts are confirmed against the printed page/i))
      .toBeVisible();
  });

  test("a line with no unusual movement has no footnote section", async ({ page }) => {
    await page.goto("/e/dept.coroner/?fy=2026");
    await expect(page.getByText(/Notes on these figures/i)).toHaveCount(0);
  });
});

test.describe("claims kept to what was verified", () => {
  test("the CSLFRF note does not assert which allowance the county elected", async ({ page }) => {
    await page.goto("/e/balance.gf.revenue-replacement/?fy=2022");
    await expect(page.getByText(/Coronavirus State and Local Fiscal Recovery Funds/i))
      .toBeVisible();
    // The provision is described; the county's election is not asserted.
    await expect(page.getByText(/the county calculated/i)).toHaveCount(0);
    await expect(page.getByText(/standard allowance/i)).toHaveCount(0);
  });

  test("summed figures say they are ours, not the county's", async ({ page }) => {
    await page.goto("/e/dept.engineering/?fy=2016");
    await expect(page.getByText(/our sum and not a published total/i).filter({ visible: true }).first())
      .toBeVisible();

    await page.goto("/e/dept.sheriff/?fy=2026");
    await expect(page.getByText(/our sum, not a figure the county printed/i)
      .filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe("the original adopted budget is recoverable", () => {
  test("methodology tells a reader where to find it", async ({ page }) => {
    // The build-out plan's fourth owner question offered "original budgets remain in the
    // downloads" as the mitigation for using the ACFR final budget. They were in no
    // download, and the methodology page said only that the final budget is used. The
    // premise is true as of 2026-07-22 and this keeps it true.
    await page.goto("/methodology/");
    const passage = page.locator("p").filter({ hasText: /final budget as printed in the audited/i });
    await expect(passage).toContainText(/original_budget/);
    await expect(passage.getByRole("link", { name: /comparison download/i })).toBeVisible();
  });

  test("the comparison download actually carries both columns", async ({ request }) => {
    const res = await request.get("/downloads/comparisons/general-fund-fy2025-budget-actual.csv");
    expect(res.status()).toBe(200);
    const header = (await res.text()).split("\n")[0];
    expect(header).toContain("original_budget");
    expect(header).toContain("budget");
  });

  test("the comparison view itself is unchanged — this was downloads-only", async ({ page }) => {
    // Deliberate scope limit. The page's design is two parallel stories, budget and actual;
    // a third figure was not added to it.
    //
    // Asserting "the string original_budget is absent" would be wrong: the caveat note now
    // names the CSV columns, and that note renders here on purpose. What must not appear is
    // a third VALUE in the comparison rows.
    await page.goto("/e/fund.general/?fy=2025");

    await expect(page.getByText(/original_budget/), "the note may name the columns")
      .toHaveCount(1);

    const comparison = page.locator("#money-in");
    await expect(comparison.getByRole("columnheader", { name: /original/i })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /original/i })).toHaveCount(0);
  });
});

test.describe("citations degrade instead of dying", () => {
  test("a source with a snapshot offers an archived copy beside the county link", async ({
    page,
  }) => {
    // The provenance chain is the product. County websites reorganise; when this one does,
    // every citation becomes a dead link unless there is a fallback.
    await page.goto("/e/fund.special-revenue/?fy=2014");
    const county = page.getByRole("link", { name: /County of Greenville/i }).first();
    await expect(county).toHaveAttribute("href", /greenvillecounty\.org/);

    const archived = page.getByRole("link", { name: /archived copy/i }).first();
    await expect(archived).toHaveAttribute("href", /web\.archive\.org/);
  });

  test("the county link stays primary — the archive is secondary, not a replacement", async ({
    page,
  }) => {
    await page.goto("/e/fund.special-revenue/?fy=2014");
    const line = page.locator("p").filter({ hasText: /archived copy/i }).first();
    // The book title (county) comes first in the citation; the archive follows it.
    const text = await line.innerText();
    expect(text.indexOf("archived copy")).toBeGreaterThan(text.indexOf("County of Greenville"));
  });

  test("the FY2026 source uses its recorded snapshot", async ({ page }) => {
    // The source archive is now complete. Pin the new FY2026 capture so a later refresh
    // cannot silently drop the fallback or attach the figure to a different snapshot.
    await page.goto("/");
    const county = page.getByRole("link", {
      name: /County of Greenville Budget Document Fiscal Year 2026/i,
    }).first();
    const provenance = county.locator("xpath=..");
    await expect(provenance.getByRole("link", { name: /archived copy/i })).toHaveAttribute(
      "href",
      "https://web.archive.org/web/20260722200906/https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf",
    );
  });
});
