import { expect, test } from "@playwright/test";

/**
 * The reader's route from the headline to what it means, and the year boundary on the way.
 *
 * `getEntityNotes` returns every note attached to an entity with no year filter at all, and
 * the comparison's always-visible list prints whatever it is handed. So a FY2026 worked example
 * is one unfiltered list away from appearing under an FY2024 comparison, describing amounts
 * that year does not contain. Only a browser, on a non-latest year, shows whether the filter
 * is really there: the static export only ever renders the latest year's panel.
 */
test.describe("what the headline total includes", () => {
  test("the homepage routes to the explanation section", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "How transfers affect this total" });
    await expect(link).toHaveAttribute("href", /\/e\/budget\.total\/\?fy=\d{4}#explanations$/);
    await link.click();
    await expect(page).toHaveURL(/\/e\/budget\.total\/\?fy=\d{4}#explanations$/);

    const explanations = page.locator("#explanations");
    await expect(explanations).toBeVisible();
    const disclosure = explanations.locator("details", { has: page.getByText("How transfers affect this total") });
    await expect(disclosure).toBeVisible();
    // Closed by default: the reader who came for the spending total is not made to read it.
    await expect(disclosure).not.toHaveAttribute("open", /.*/);
    await disclosure.getByRole("group").or(disclosure.locator("summary")).first().click();
    await expect(disclosure.getByText("$2,270,221")).toBeVisible();
    await expect(disclosure.getByText("$2,500,000")).toBeVisible();
  });

  test("the caveat sits with the amount and inside the chart a reader would crop", async ({ page }) => {
    await page.goto("/e/budget.total/?fy=2026");
    const callouts = page.locator("[data-note-callouts]");
    await expect(callouts).toHaveCount(2);
    await expect(callouts.first()).toContainText("some money appears in more than one fund");

    const figure = page.locator("#change-over-time figure[data-viz]");
    await expect(figure.locator("[data-note-callouts]")).toContainText("not actual service spending");
    // The growth result is unchanged; only its qualification moved next to it.
    await expect(page.locator("#change-over-time")).toContainText("+49.6%");
  });

  test("a historical year keeps the open-ended disclosure and drops the FY2026 example", async ({ page }) => {
    await page.goto("/e/budget.total/?fy=2024");
    await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", "2024");

    await expect(page.locator("#explanations")).toBeVisible();
    await expect(page.getByText("Why no transfers-removed total?")).toBeVisible();
    await expect(page.getByText("How transfers affect this total", { exact: true })).toHaveCount(0);
    await expect(page.locator("#explanations")).not.toContainText("$2,500,000");

    // The callout is open-ended, so it stays.
    await expect(page.locator("[data-note-callouts]").first()).toContainText("some money appears in more than one fund");
  });

  test("the explanations never leak into the always-visible comparison list", async ({ page }) => {
    await page.goto("/e/budget.total/?fy=2026");
    const comparison = page.locator("#change-over-time");
    // The list sits between the two-year result and the figure; the explanation bodies belong
    // in the disclosure, which is a different section of the page.
    const listed = comparison.locator("ul > li");
    await expect(listed.filter({ hasText: "Workers Compensation Internal Service Fund" })).toHaveCount(0);
    await expect(listed.filter({ hasText: "not yet available on this site" })).toHaveCount(0);
  });

  test("the worked example's citation reaches the county document it names", async ({ page }) => {
    // R7.4: a public limitation needs a real link, not a document cover or a repository path.
    // The FY#### tokens in a note's source_ref are resolved against sources.json on the server
    // and rendered as links. The page numbers stay as text: one citation names two pages
    // (p.131 and p.8), and a single href can carry only one #page fragment.
    await page.goto("/e/budget.total/?fy=2026");
    const disclosure = page.locator("details", { has: page.getByText("How transfers affect this total") });
    await disclosure.locator("summary").click();
    const source = disclosure.getByText(/^Source:/);
    await expect(source).toContainText("p.131");
    await expect(source).toContainText("p.8");
    // The SPECIFIC destination, not "some county PDF": this is the FY2026 book's official_url
    // in web/data/sources.json. A link to any other county document must fail here.
    const fy2026Links = disclosure.getByRole("link", { name: "FY2026" });
    await expect(fy2026Links).toHaveCount(2);
    for (const link of await fy2026Links.all()) {
      await expect(link).toHaveAttribute("href", "https://www.greenvillecounty.org/ManagementandBudget/pdf/2026/BudgetCombined.pdf");
    }

    // The other explanation cites the site's own methodology, and must not cite a draft plan.
    // The citation has to be a LINK a resident can follow to the named section, not a path
    // printed as text (round-3 review, D7).
    const notCalculated = page.locator("details", { has: page.getByText("Why no transfers-removed total?") });
    await notCalculated.locator("summary").click();
    await expect(notCalculated).not.toContainText("transfer-clarity-plan");
    const methodology = notCalculated.getByRole("link", { name: /Methodology: what this site does not do/ });
    await expect(methodology).toHaveAttribute("href", "/methodology/#excluded");
    await methodology.click();
    await expect(page).toHaveURL(/\/methodology\/#excluded$/);
    await expect(page.locator("#excluded")).toBeVisible();
    await expect(page.locator("#excluded")).toContainText("It does not calculate a transfers-removed total");
  });

  test("an unrelated entity page has neither a callout nor a disclosure", async ({ page }) => {
    await page.goto("/e/dept.sheriff/?fy=2026");
    await expect(page.locator("[data-note-callouts]")).toHaveCount(0);
    await expect(page.locator("#explanations")).toHaveCount(0);
  });
});
