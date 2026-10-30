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

  it("composes the reviewed title format", () => {
    expect(entityTitle("General Fund", 2025)).toBe("General Fund — FY2025");
    expect(entityDocumentTitle("General Fund", 2025))
      .toBe("General Fund — FY2025 · Greenville County Budget Explorer");
  });

  it("names the server-rendered year in a fund route's metadata", () => {
    expect(fundMetadata().title).toBe("General Fund — FY2027");
  });

  it("names the server-rendered year in an ordinary entity's metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ entityId: "balance.debt.beginning" }),
    });
    expect(metadata.title).toBe("Debt Service Beginning Fund Balance — FY2027");
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
