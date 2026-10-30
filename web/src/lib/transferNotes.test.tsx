import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EntityLatestYearPage from "@/app/e/[entityId]/page";
import { V2EntityHistory, V2EntityYearView } from "@/components/V2EntityYearView";
import { getV2EntityPage } from "./loaders";

/**
 * Where the two new render contracts put their text, and where they must not.
 *
 * `callout` and `explanation` render themselves in full, so the footnote layer has to stop
 * handling them — and stopping it is not the same as renumbering it. `NoteFootnotes` iterates
 * whatever it is handed and does not consult the numbering to decide whether to render, so a
 * note dropped from `numberNotes()` alone would still appear at the foot of the page, with an
 * empty number, repeating text already on screen in full.
 *
 * The negative cases matter as much: every other entity page must be untouched, and a page
 * whose notes are ordinary footnotes must still get its marks and its list.
 */
const render = async (entityId: string) =>
  renderToStaticMarkup(await EntityLatestYearPage({ params: Promise.resolve({ entityId }) }));

// Without the apostrophe: renderToStaticMarkup escapes it as &#x27;, so the literal from the
// CSV does not match the markup.
const CALLOUT_TEXT = "published total, so some money appears in more than one fund";

describe("transfer callouts and explanations on the whole-budget page", () => {
  it("renders the callout beside the amount and inside the chart's own frame", async () => {
    const html = await render("budget.total");
    expect(html).toContain("data-note-callouts");
    // Twice: once under the amount cards, once inside the chart card, because a reader who
    // crops the chart must take the caveat with it.
    expect(html.match(new RegExp(CALLOUT_TEXT, "g"))?.length).toBe(2);
    expect(html).toContain("This total includes transfers between funds");
  });

  it("puts the two explanations behind a disclosure with a stable anchor", async () => {
    const html = await render("budget.total");
    expect(html).toContain('id="explanations"');
    expect(html).toContain("<summary");
    expect(html).toContain("How transfers affect this total");
    expect(html).toContain("Why no transfers-removed total?");
    expect(html).toContain("$2,270,221");
    expect(html).toContain("$2,500,000");
  });

  it("does not also list them as footnotes or mark them with a superscript", async () => {
    const html = await render("budget.total");
    expect(html).not.toContain('data-note-footnote-id="note.interfund-transfers-not-netted"');
    expect(html).not.toContain('data-note-footnote-id="note.transfers-removed-not-calculated"');
    expect(html).not.toContain('data-note-footnote-id="note.fy2026-transfers-in-this-total"');
    // The mark links carry data-note-id inside a <sup>; the disclosure carries it on <details>.
    expect(/<sup[^>]*>(?:(?!<\/sup>)[\s\S])*note\.interfund-transfers-not-netted/.test(html)).toBe(false);
    // The old footnote wording is gone rather than merely unnumbered.
    expect(html).not.toContain("netting them away");
  });

  it("leaves an unrelated entity page with no callout and no disclosure", async () => {
    const html = await render("balance.debt.beginning");
    expect(html).not.toContain("data-note-callouts");
    expect(html).not.toContain('id="explanations"');
  });

  it("keeps ordinary footnote notes numbered and listed", async () => {
    // The regression risk in filtering the footnote layer is filtering too much. This entity's
    // note is an ordinary `footnote`, and it must still get a mark and an entry.
    const html = await render("dept.employeebenefitfund");
    expect(html).toContain('data-note-footnote-id="note.fy2020-employee-benefit-fund"');
    expect(html).toContain("Notes on these figures");
    expect(html).not.toContain("data-note-callouts");
  });
});

describe("transfer-surge marks on actual points", () => {
  it("marks actual amount cards and both ledgers, leaving financing amounts unmarked", () => {
    const page = getV2EntityPage("fin.gf.transfers-in");
    const history = renderToStaticMarkup(<V2EntityHistory page={page} />);
    for (const year of [2022, 2023]) {
      const id = `note.fy${year}-transfer-surge`;
      const card = renderToStaticMarkup(<V2EntityYearView page={page} year={year} />);
      const actual = page.series.find(point => point.fiscal_year === year && point.status_class === "actual")!;
      const financing = page.series.find(point => point.fiscal_year === year && point.status_class === "financing")!;
      const actualAmount = actual.value!.toLocaleString("en-US");
      const financingAmount = financing.value!.toLocaleString("en-US");
      expect(card.match(new RegExp(`data-note-id="${id}"`, "g"))).toHaveLength(1);
      // The history renders a desktop table and a mobile ledger; each marks the actual.
      expect(history.match(new RegExp(`data-note-id="${id}"`, "g"))).toHaveLength(2);
      for (const html of [card, history]) {
        expect(html).toMatch(new RegExp(`\\$${actualAmount}</span><sup[^>]*>[\\s\\S]*?data-note-id="${id}"`));
        expect(html).toContain(`$${financingAmount}`);
        expect(html).not.toMatch(new RegExp(`\\$${financingAmount}</span><sup`));
      }
      expect(history).toContain(`data-note-footnote-id="${id}"`);
    }
  });
});
