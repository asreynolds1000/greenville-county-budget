import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const webRoot = process.cwd();
const entityRoot = path.join(webRoot, "out", "e");
const manifest = JSON.parse(fs.readFileSync(path.join(webRoot, "data/v2/manifest.json"), "utf8")) as {
  coverage_page_entity_count: number;
  coverage_page_route_count: number;
};

// The immutable manifest counts base + every supported FY view. Keep that same sweep
// after consolidation: the old FY files are compatibility HTML, so inspect each hydrated
// selection. Split by entity to retain normal per-test timeout and parallelism.
// UNEXECUTED in the Codex sandbox; Playwright configuration is unchanged.
const entities = fs.readdirSync(entityRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const html = fs.readFileSync(path.join(entityRoot, entry.name, "index.html"), "utf8");
    if (!/data-coverage-level="/.test(html)) return [];
    const data = JSON.parse(fs.readFileSync(path.join(webRoot, "data/v2/pages", `${entry.name}.json`), "utf8")) as {
      series: { fiscal_year: number }[];
    };
    return [{ id: entry.name, years: [...new Set(data.series.map((point) => point.fiscal_year))] }];
  });

test("coverage sweep preserves the exporter-owned entity and year-view counts", () => {
  expect(entities.length).toBeGreaterThan(0);
  expect(entities.length).toBe(manifest.coverage_page_entity_count);
  expect(entities.reduce((sum, entry) => sum + 1 + entry.years.length, 0))
    .toBe(manifest.coverage_page_route_count);
});

async function assertCoverageEvidence(page: Page) {
  await expect(page.locator("main [data-coverage-level]").first()).toBeVisible();
  const failures = await page.locator("main [data-coverage-level]:not([data-coverage-level='unavailable'])")
    .evaluateAll((regions) => regions.flatMap((region) => {
      if (region.querySelector("[data-unpublished='false'], a[href]:not([data-coverage-badge='true'])")) return [];
      return [{
        scope: region.getAttribute("data-coverage-scope"),
        domain: region.getAttribute("data-coverage-domain"),
        level: region.getAttribute("data-coverage-level"),
      }];
    }));
  expect(failures, `coverage claims without figures or a figures link: ${page.url()}`).toEqual([]);
}

for (const entity of entities) {
  test(`every covered year retains evidence: ${entity.id}`, async ({ page }) => {
    await page.goto(`/e/${entity.id}/`);
    await assertCoverageEvidence(page);
    for (const year of entity.years) {
      await page.getByRole("combobox", { name: "Explore fiscal year", exact: true }).selectOption(String(year));
      await expect(page.locator("[data-entity-year]")).toHaveAttribute("data-entity-year", String(year));
      await assertCoverageEvidence(page);
    }
  });
}

test("the county overview retains coverage evidence", async ({ page }) => {
  await page.goto("/");
  const disclosure = page.locator("main details").filter({
    has: page.getByText("What is included, and where are the gaps?", { exact: true }),
  });
  await disclosure.locator("summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
  await assertCoverageEvidence(page);
});
