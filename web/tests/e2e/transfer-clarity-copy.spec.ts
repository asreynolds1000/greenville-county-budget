import { expect, test } from "@playwright/test";

/**
 * Tier 1 of the transfer-clarity plan: the headline says what it is a total OF.
 *
 * A reader asked why a transfer counted on both sides is counted twice. The site does not
 * compute a wrong number; it called a gross appropriation total "the budget" and kept the
 * reason for its grossness somewhere else. These assertions pin the corrected wording where a
 * reader meets it.
 *
 * Deliberately DOM text and named locators rather than `grep -c` on the built HTML. `grep -c`
 * counts matching lines, not occurrences; the current homepage carries five copies of one
 * phrase on a single physical line. The hero also serializes as `FY<!-- -->2026<!-- -->`, so a
 * contiguous "FY2026" grep would fail on markup that renders correctly.
 */
test.describe("the headline names what it is a total of", () => {
  test("the hero eyebrow and its link label describe the published total", async ({ page }) => {
    await page.goto("/");

    const hero = page.getByRole("link", { name: /Open the county-published FY\d{4} budget total and its source/ });
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute("href", /\/e\/budget\.total\/\?fy=\d{4}$/);
    await expect(hero.locator("p").first())
      .toHaveText(/^County-published FY\d{4} budget total, including transfers between funds$/);

    // The claim is that the old wording is gone from the page a reader sees, not merely that
    // the new wording exists somewhere alongside it.
    await expect(page.getByText("all four funds, as approved by County Council")).toHaveCount(0);
  });

  test("the whole-budget entity describes itself as a total of fund budgets", async ({ page }) => {
    await page.goto("/e/budget.total/?fy=2026");
    // Sourced from data/production/entity.csv, not hardcoded in a component: the description
    // travels with the entity into the downloads and the search index too.
    await expect(page.getByText("The county’s published total of fund budgets, including transfers between the funds")).toBeVisible();
    await expect(page.getByText("County-reported total of all included funds")).toHaveCount(0);
  });

  test("the coverage section no longer claims the county publishes no revenue total", async ({ page }) => {
    await page.goto("/");
    await page.getByText("What is included, and where are the gaps?").click();

    await expect(page.getByText("This site does not combine their funding into a countywide revenue figure.")).toBeVisible();
    // The county does print "Total Estimated Financial Sources $388,631,230" on p.36 of the
    // FY2026 book, so the old sentence was false as written.
    await expect(page.getByText("The county publishes no single revenue total across all four funds")).toHaveCount(0);
  });
});
