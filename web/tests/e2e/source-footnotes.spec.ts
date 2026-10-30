import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type SourceNote = {
  note_id: string;
  note_type: string;
  scope_type: string;
  scope_value: string;
  fiscal_year_start: number;
  fiscal_year_end: number;
};

type SeriesPoint = {
  fiscal_year: number;
  measure_type: string;
  status_class: string;
};

type EntityPage = {
  entity_id: string;
  series: SeriesPoint[];
};

const WEB_ROOT = process.cwd();

const sourceNotes = (JSON.parse(
  fs.readFileSync(path.join(WEB_ROOT, "data", "v2", "notes.json"), "utf8"),
).notes as SourceNote[]).filter((note) => note.note_type === "source_footnote");

test("the source-footnote sweep remains nonempty", () => {
  expect(sourceNotes.length).toBeGreaterThan(0);
});

for (const note of sourceNotes) {
  const entity = JSON.parse(fs.readFileSync(
    path.join(WEB_ROOT, "data", "v2", "pages", `${note.scope_value}.json`), "utf8",
  )) as EntityPage;
  const applicable = entity.series.filter((point) => point.fiscal_year >= note.fiscal_year_start
    && point.fiscal_year <= note.fiscal_year_end);
  test(`source footnote applies to published figures: ${note.note_id}`, () => {
    expect(note.scope_type).toBe("entity");
    expect(applicable.length).toBeGreaterThan(0);
  });
  for (const point of applicable) {
    const key = [entity.entity_id, point.fiscal_year, point.status_class, point.measure_type].join("|");
    test(`selected figure preserves ${note.note_id}: ${key}`, async ({ page }) => {
      await page.goto(`/e/${entity.entity_id}/?fy=${point.fiscal_year}`);
      const card = page.locator(`[data-canonical-value="${key}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator(`[data-note-id="${note.note_id}"]`)).toBeVisible();
      await expect(card.locator(`a[href="#note-${note.note_id.replace(/[^a-z0-9]+/gi, "-")}"]`)).toBeVisible();
      await expect(page.locator(`[data-note-footnote-id="${note.note_id}"]`)).toHaveCount(1);
    });
  }
}

test("source-footnote marks and text survive print", async ({ page }) => {
  await page.goto("/e/fund.sr.road-program/?fy=2026");
  await page.emulateMedia({ media: "print" });

  const mark = page.locator('[data-note-id^="note.source-footnote."]').first();
  const footnote = page.locator('[data-note-footnote-id^="note.source-footnote."]').first();
  await expect(mark).toBeVisible();
  await expect(footnote).toBeVisible();
  await expect(footnote).toContainText("Expenditures include transfers out to other funds");
});
