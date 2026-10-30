import { describe, expect, it } from "vitest";

import { noteAppliesToYears } from "@/components/DataNotes";
import { assertGeneralFundPageCanRender, getDataNotes, getEntityNotes, getGeneralFundPageNotes, noteAppliesToYear, seriesBreaksAt } from "./loaders";
import type { DataNote } from "./schema";

const NOTE: DataNote = {
  fiscal_year_end: null, fiscal_year_start: null, headline: "h", note_id: "note.test", note_type: "caveat",
  render_contract: "footnote", scope_type: "entity", scope_value: "fund.general", severity: "info",
  source_ref: "FY2026", text: "t", status_class: null,
} as DataNote;

describe("the data note layer", () => {
  it("scopes year notes to the years they describe", () => {
    const twelve = getDataNotes(2012).map((note) => note.note_type);
    expect(twelve).toContain("extraction_method");
    expect(getDataNotes(2013).map((n) => n.note_type)).not.toContain("extraction_method");
  });

  it("carries the budget-to-GAAP note for its era and no further", () => {
    for (const year of [2011, 2014, 2017]) {
      expect(
        getDataNotes(year).map((n) => n.note_type),
        `FY${year}`,
      ).toContain("basis_adjustment");
    }
    for (const year of [2018, 2025]) {
      expect(
        getDataNotes(year).map((n) => n.note_type),
        `FY${year}`,
      ).not.toContain("basis_adjustment");
    }
  });

  it("distinguishes the explained transfer surge from the unexplained one", () => {
    expect(getDataNotes(2022).map((n) => n.note_type)).toContain("unusual_movement");
    expect(getDataNotes(2023).map((n) => n.note_type)).toContain("undocumented_cause");

    const undocumented = getDataNotes(2023).find((n) => n.note_type === "undocumented_cause");
    // The county's report does not explain it, and the note must not imply otherwise.
    expect(undocumented?.severity).toBe("warning");
    expect(undocumented?.text).toMatch(/could not find|not stated/i);
  });

  it("scopes the transfer notes to actual points and retains them on the General Fund page", () => {
    for (const year of [2022, 2023]) {
      const id = `note.fy${year}-transfer-surge`;
      expect(getDataNotes(year, { statusClass: "actual" }).map(note => note.note_id)).toContain(id);
      for (const status of ["adopted", "estimated", "financing"] as const) {
        expect(getDataNotes(year, { statusClass: status }).map(note => note.note_id)).not.toContain(id);
      }
      const note = getEntityNotes("fin.gf.transfers-in").find(note => note.note_id === id);
      expect(note).toBeDefined();
      if (!note) continue;
      expect(note.status_class).toBe("actual");
      expect(noteAppliesToYear(note, year, "actual")).toBe(true);
      for (const status of ["adopted", "estimated", "financing", "projected", "proposed", null] as const) {
        expect(noteAppliesToYear(note, year, status)).toBe(false);
      }
      expect(noteAppliesToYear(note, year)).toBe(false);
      expect(noteAppliesToYear(note, year + 1, "actual")).toBe(false);
      expect(getGeneralFundPageNotes(year).map(note => note.note_id)).toContain(id);
      expect(getEntityNotes("fund.general").map(note => note.note_id)).not.toContain(id);
    }
    // A blank status axis leaves existing notes usable with or without a point status.
    expect(noteAppliesToYear(NOTE, 2022)).toBe(true);
    expect(noteAppliesToYear(NOTE, 2022, "adopted")).toBe(true);
  });

  it("attaches line notes to a canonical key, not a display label", () => {
    // Display labels drift between years; the key does not.
    const derived = getDataNotes(2018, { scopeType: "line" });
    expect(derived.map((n) => n.scope_value)).toContain("public_safety");

    const debtService = getDataNotes(2025, { scopeType: "line" });
    expect(debtService.map((n) => n.scope_value)).toContain("debt_service");
    expect(debtService.find((n) => n.scope_value === "debt_service")?.note_type)
      .toBe("no_appropriation");
  });

  it("does not apply the FY2018 derived-value note to other years", () => {
    expect(getDataNotes(2019, { scopeType: "line" }).map((n) => n.scope_value))
      .not.toContain("public_safety");
  });

  it("reports the FY2013 reorganisation as a series break", () => {
    // The render contract: a series crossing this year must be split into segments rather
    // than drawn as one continuous line. `seriesBreaksAt` is what a chart must consult.
    expect(seriesBreaksAt(2013)).toBe(true);
    expect(seriesBreaksAt(2014)).toBe(false);
    expect(seriesBreaksAt(2012)).toBe(false);
  });

  it("gives every note a severity and a render contract", () => {
    const all = getDataNotes(2025).concat(getDataNotes(2012), getDataNotes(2018));
    expect(all.length).toBeGreaterThan(0);
    for (const note of all) {
      expect(["info", "warning"]).toContain(note.severity);
      expect(note.render_contract.length).toBeGreaterThan(0);
      expect(note.text.length).toBeGreaterThan(20);
    }
  });

  it("keeps entity and series notes off unrelated General Fund pages", () => {
    const fy2023 = getGeneralFundPageNotes(2023);
    expect(fy2023.map((note) => note.note_id)).not.toContain(
      "note.printed-dash-affordable-housing",
    );
    expect(fy2023.map((note) => note.note_id)).not.toContain(
      "note.printed-dash-natural-resources",
    );

    const fy2016 = getGeneralFundPageNotes(2016);
    expect(fy2016.map((note) => note.note_id)).not.toContain(
      "note.fy2016-engineering-consolidation",
    );

    const fy2025 = getGeneralFundPageNotes(2025);
    expect(fy2025.map((note) => note.note_id)).not.toContain(
      "note.interfund-transfers-not-netted",
    );
    expect(fy2025.map((note) => note.note_id)).toContain("note.comparison-basis");
  });
});

describe("year-scoped notes reach a chart window the way they reach a single year", () => {
  it("applies an open-ended note to any window and a bounded one only where it overlaps", () => {
    expect(noteAppliesToYears(NOTE, 2011, 2026)).toBe(true);
    const bounded = { ...NOTE, fiscal_year_start: 2026, fiscal_year_end: 2026 };
    expect(noteAppliesToYears(bounded, 2022, 2026)).toBe(true);
    expect(noteAppliesToYears(bounded, 2020, 2024)).toBe(false);
    const upTo = { ...NOTE, fiscal_year_end: 2015 };
    expect(noteAppliesToYears(upTo, 2016, 2020)).toBe(false);
    expect(noteAppliesToYears(upTo, 2010, 2016)).toBe(true);
  });
});

describe("the General Fund page refuses notes it has nowhere to render", () => {
  it("passes footnote-contract notes through untouched", () => {
    expect(assertGeneralFundPageCanRender(2026, [NOTE])).toEqual([NOTE]);
  });
  it("fails the build by name for a callout or explanation scoped to the page", () => {
    for (const render_contract of ["callout", "explanation"] as const) {
      expect(() => assertGeneralFundPageCanRender(2026, [{ ...NOTE, render_contract }]))
        .toThrow(/no renderer for note\.test \((callout|explanation)\)/);
    }
  });
  it("accepts every covered General Fund year as the data stands", () => {
    for (const year of [2005, 2014, 2025, 2026]) expect(() => getGeneralFundPageNotes(year)).not.toThrow();
  });
});
