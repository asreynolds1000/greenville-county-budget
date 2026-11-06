import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { generateMetadata } from "@/app/e/[entityId]/page";
import { generateMetadata as fundMetadata } from "@/app/e/fund.general/page";
import EntityLatestYearPage from "@/app/e/[entityId]/page";
import { entityDocumentTitle, entityTitle, entityTitleName } from "@/lib/entityTitle";

/**
 * The route consolidation dropped the fiscal year from every entity page title: the reviewed
 * baseline for FY2025 General Fund says "General Fund — FY2025 · Greenville County Budget
 * Explorer" and the consolidated page was serving "General Fund". A page of FY2014 figures
 * titled only "General Fund" is wrong in the tab, in a bookmark, in the history entry the
 * explorer pushes, and in a search result.
 *
 * These assertions are the durable half of that repair. The client-side half — document.title
 * following the selected year — cannot be asserted here because it is an effect in a client
 * component; the browser spec owns it, and the rendered page baselines capture it.
 */
describe("entity page titles keep their fiscal year", () => {
  it("qualifies operating-overview categories so they do not share a title with department-view categories", () => {
    expect(entityTitleName("overview.gf.public-works", "Public Works")).toBe("Public Works (operating overview)");
    expect(entityTitleName("opcat.public-works", "Public Works")).toBe("Public Works");
    expect(entityTitleName("dept.sheriff", "Sheriff")).toBe("Sheriff");
  });

  it.each([
    ["fund.general", "General Fund", "Greenville County General Fund budget, FY2025"],
    ["dept.sheriff", "Sheriff", "Greenville County Sheriff budget, FY2025"],
    ["opcat.public-works", "Public Works", "Greenville County Public Works budget, FY2025"],
    ["overview.gf.public-works", "Public Works", "Greenville County Public Works (operating overview) budget, FY2025"],
    ["isf.fleet", "Fleet", "Greenville County Fleet budget, FY2025"],
    ["use.salaries", "Salaries", "Greenville County Salaries budget, FY2025"],
    ["gf.expenditures", "Expenditures", "Greenville County Expenditures budget, FY2025"],
    ["budget.total", "Total", "Greenville County Total budget, FY2025"],
    ["rev.charges-for-services", "Charges for Services", "Greenville County Charges for Services, FY2025"],
    ["balance.gf.ending", "General Fund Ending Balance", "Greenville County General Fund Ending Balance, FY2025"],
    ["fin.debt", "Debt Financing", "Greenville County Debt Financing, FY2025"],
    ["change.gf", "General Fund Change", "Greenville County General Fund Change, FY2025"],
    ["funding.x", "Some Funding", "Greenville County Some Funding, FY2025"],
    ["newkind.x", "Anything", "Greenville County Anything, FY2025"],
  ])("titles %s", (id, name, want) => {
    expect(entityTitle(id, name, 2025)).toBe(want);
  });

  it("does not repeat 'budget' when the name already ends in it", () => {
    expect(entityTitle("budget.total", "Total Budget", 2027)).toBe("Greenville County Total Budget, FY2027");
    expect(entityTitle("dept.x", "Capital BUDGET", 2027)).toBe("Greenville County Capital BUDGET, FY2027");
  });

  it("does not repeat 'Greenville County' when the name already starts with it", () => {
    expect(entityTitle("fund.x", "Greenville County Library", 2027)).toBe("Greenville County Library budget, FY2027");
    expect(entityTitle("rev.x", "Greenville County Fees", 2027)).toBe("Greenville County Fees, FY2027");
  });

  it("composes the document title with the short site name", () => {
    expect(entityDocumentTitle("fund.general", "General Fund", 2025))
      .toBe("Greenville County General Fund budget, FY2025 · Budget Explorer");
  });

  it("names the server-rendered year in a fund route's metadata", () => {
    expect(fundMetadata().title).toEqual({ absolute: "Greenville County General Fund budget, FY2027 · Budget Explorer" });
  });

  it("names the server-rendered year in an ordinary entity's metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ entityId: "balance.debt.beginning" }),
    });
    expect(metadata.title).toEqual({ absolute: "Greenville County Debt Service Beginning Fund Balance, FY2027 · Budget Explorer" });
  });

  it("gives the year explorer the display name it needs to retitle the document", async () => {
    const element = await EntityLatestYearPage({
      params: Promise.resolve({ entityId: "balance.debt.beginning" }),
    });
    // renderToStaticMarkup runs the server pass only, so the effect never fires here. What it
    // does prove is that the display name reaches the client component, which stamps it on its
    // wrapper: without the prop the effect has nothing to compose and the regression returns
    // silently. The year control's aria-label is emitted with or without the prop, so it is
    // not evidence of anything here.
    expect(renderToStaticMarkup(element)).toContain('data-entity-name="Debt Service Beginning Fund Balance"');
  });
});
