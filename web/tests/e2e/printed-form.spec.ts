import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type SeriesPoint = {
  fiscal_year: number;
  measure_type: string;
  printed_form: string | null;
  status_class: string;
};

type EntityPage = {
  entity_id: string;
  series: SeriesPoint[];
};

// Playwright runs from web/ in both package scripts and CI.
const WEB_ROOT = process.cwd();
const PAGES_ROOT = path.join(WEB_ROOT, "data", "v2", "pages");

function dashPoints(): Array<{ page: EntityPage; point: SeriesPoint }> {
  const results: Array<{ page: EntityPage; point: SeriesPoint }> = [];
  for (const filename of fs
    .readdirSync(PAGES_ROOT)
    .filter((name) => name.endsWith(".json"))) {
    const page = JSON.parse(
      fs.readFileSync(path.join(PAGES_ROOT, filename), "utf8"),
    ) as EntityPage;
    for (const point of page.series) {
      if (point.printed_form === "-" || point.printed_form === "--") {
        results.push({ page, point });
      }
    }
  }
  return results;
}

const affected = dashPoints();

test("the data-derived dash sweep remains nonempty", () => {
  expect(affected.length).toBeGreaterThan(0);
});

for (const { page: entity, point } of affected) {
  const key = [entity.entity_id, point.fiscal_year, point.status_class, point.measure_type].join("|");
  test(`dash source form survives year selection: ${key}`, async ({ page }) => {
    await page.goto(`/e/${entity.entity_id}/?fy=${point.fiscal_year}`);
    const card = page.locator(`[data-canonical-value="${key}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(`[data-printed-form="${point.printed_form}"]`)).toBeVisible();
    await expect(card.locator('[data-printed-dash-marker="true"]')).toBeVisible();
    await expect(card.locator('a[href="#note-note-printed-dash"]')).toHaveAttribute(
      "aria-label", "Source-form note: the county printed a dash here, not a numeric zero",
    );
    await expect(page.locator("#note-note-printed-dash")).toHaveCount(1);
  });
}

test("dash source-form disclosure survives print", async ({ page }) => {
  await page.goto("/e/balance.enterprise.solid-waste-usage/?fy=2004");
  await page.emulateMedia({ media: "print" });

  await expect(
    page.locator('[data-printed-dash-marker="true"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-printed-dash-footnote="true"]'),
  ).toBeVisible();
});

test("the footnote appears only on pages that carry a dagger mark", async ({
  page,
}) => {
  // A page with at least one dash-derived value: the footnote is a footnote to something.
  await page.goto("/e/use.debt.boards-commissions-others/?fy=2022");
  await expect(
    page.locator('[data-printed-dash-mark="true"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-printed-dash-footnote="true"]'),
  ).toBeVisible();

  // Pages with no dagger anywhere on them: the note is present for a stable anchor id
  // (the mark on another page always resolves), but must not render visibly here.
  for (const route of ["/", "/services/roads/", "/search/"]) {
    await page.goto(route);
    await expect(page.locator('[data-printed-dash-mark="true"]')).toHaveCount(
      0,
    );
    await expect(
      page.locator('[data-printed-dash-footnote="true"]'),
    ).toBeAttached();
    await expect(
      page.locator('[data-printed-dash-footnote="true"]'),
    ).toBeHidden();
    await expect(page.locator("#note-note-printed-dash")).toBeAttached();
  }
});
