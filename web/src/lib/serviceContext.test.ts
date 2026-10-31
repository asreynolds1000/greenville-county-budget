import { describe, expect, it } from "vitest";

import { getV2EntityPage } from "./loaders";
import { getSearchGuide, getServiceContext } from "./serviceContext";

describe("FY2026 authored service context", () => {
  it("keeps the Sheriff description scoped to FY2026", () => {
    const sheriff = getServiceContext("dept.sheriff", 2026);
    expect(sheriff?.summary).toContain("FY2026 only");
    expect(getServiceContext("dept.sheriff", 2025)).toBeUndefined();
    expect(sheriff?.source.href).toMatch(/#page=124$/);
  });

  it("keeps the transit guide separate from the Outside Agencies aggregate", () => {
    const guide = getSearchGuide("public transit");
    expect(guide?.title).toBe("Public transit and GreenLink");
    expect(guide?.summary).toContain("not transit alone");
    expect(guide?.source.href).toMatch(/#page=131$/);
    expect(guide?.additionalSource?.href).toMatch(/#page=193$/);
  });

  it("explains Administration as an FY2026 category containing EMS", () => {
    const administration = getServiceContext("opcat.department-of-administration", 2026);
    expect(administration?.shortLabel).toBe("EMS and county support");
    expect(administration?.summary).toContain("Emergency Medical Services");
    expect(administration?.summary).toContain("$32,783,093");
    expect(administration?.source.href).toMatch(/#page=66$/);
    expect(getServiceContext("opcat.department-of-administration", 2025)).toBeUndefined();
  });

  it("keeps EMS service detail and its limited change explanation scoped to FY2026", () => {
    const ems = getServiceContext("dept.emergencymedicalservices", 2026);
    expect(ems?.shortLabel).toBe("Ambulance services");
    expect(ems?.summary).toContain("ambulance transport");
    expect(ems?.changeNote).toContain("five added paramedic positions");
    expect(ems?.source.href).toMatch(/#page=72$/);
    expect(getServiceContext("dept.emergencymedicalservices", 2025)).toBeUndefined();
  });

  it("adds common FY2026 services only to their exact current entity", () => {
    expect(getServiceContext("dept.animalcareservices", 2026)?.shortLabel).toBe("Animal shelter and care");
    expect(getServiceContext("dept.propertymanagement", 2026)?.summary).toContain("county facilities");
    expect(getServiceContext("dept.emergencymanagement", 2026)?.summary).toContain("Emergency Operations Center");
    expect(getServiceContext("dept.informationsytems", 2026)?.shortLabel).toBe("County technology services");
    expect(getServiceContext("dept.informationsystemsandservices", 2026)).toBeUndefined();
  });

  it("directs road searches to a guide without creating a combined road budget", () => {
    const guide = getSearchGuide("roads");
    expect(guide?.title).toBe("How the separate road budgets relate");
    expect(guide?.href).toBe("/services/roads/");
    expect(guide?.summary).toContain("do not provide a reconciliation");
    expect(guide?.summary).toContain("latest published year is FY2015");

    const roadPaving = getServiceContext("fund.sr.road-paving", 2015);
    expect(roadPaving?.summary).toContain("must not be added");
    expect(roadPaving?.guide?.href).toBe("/services/roads/");
    expect(getServiceContext("fund.sr.road-paving", 2026)).toBeUndefined();
  });

  it("keeps FY2026 parks views distinct and sends common parks searches to the guide", () => {
    const fund = getServiceContext("fund.sr.parks-recreation-tourism", 2026);
    const spending = getServiceContext("use.sr.parks-recreation-tourism", 2026);
    const debt = getServiceContext("use.debt.parks-recreation-tourism", 2026);

    expect(fund?.shortLabel).toBe("Parks, trails, and recreation");
    expect(fund?.searchSummary).toContain("parks, trails, recreation facilities, and programs");
    expect(fund?.additionalSource?.href).toMatch(/#page=48$/);
    expect(spending?.shortLabel).toBe("Parks services and equipment");
    expect(spending?.searchSummary).toContain("Already included in the whole parks fund");
    expect(debt?.searchSummary).toContain("does not establish");
    expect(debt?.additionalSource?.href).toMatch(/#page=48$/);
    expect(getServiceContext("fund.sr.parks-recreation-tourism", 2025)).toBeUndefined();

    for (const query of ["parks", "recreation", "trails", "parks and recreation"]) {
      const guide = getSearchGuide(query);
      expect(guide?.title).toBe("How the parks figures fit together");
      expect(guide?.href).toBe("/services/parks/");
      expect(guide?.summary).toContain("already includes $17,475,148");
    }
  });
});

describe("FY2027 authored service context", () => {
  it.each([
    ["dept.sheriff", 123, "Law enforcement services", "court security"],
    ["dept.outsideagencies", 130, "Community organizations and transit", "not transit alone"],
    ["opcat.department-of-administration", 65, "EMS and county support", "Emergency Medical Services"],
    ["dept.emergencymedicalservices", 71, "Ambulance services", "ambulance transport"],
    ["dept.humanresources", 66, "County workforce support", "recruiting and onboarding"],
    ["dept.informationsytems", 68, "County technology services", "network and workstation access"],
    ["dept.emergencymanagement", 70, "Disaster preparedness and response", "Emergency Operations Center"],
    ["dept.animalcareservices", 82, "Animal shelter and care", "open-admission shelter"],
    ["dept.propertymanagement", 87, "County buildings and facilities", "county facilities"],
    ["dept.engineeringandroadbureaus", 84, "County road maintenance", "three road bureaus"],
    ["fund.sr.road-program", 150, "Paving, sidewalks and road projects", "traffic calming"],
    ["fund.sr.parks-recreation-tourism", 145, "Parks, trails, and recreation", "transfers out"],
    ["use.sr.parks-recreation-tourism", 145, "Parks services and equipment", "expenditure line within"],
    ["use.debt.parks-recreation-tourism", 48, "Parks category in the debt summary", "prints a dash"],
  ] as const)("scopes %s to its FY2027 source page", (entityId, printedPage, shortLabel, detail) => {
    const context = getServiceContext(entityId, 2027);
    expect(context, entityId).toBeDefined();
    expect(context!.fiscalYear).toBe(2027);
    expect(context!.shortLabel).toBe(shortLabel);
    expect(context!.summary).toContain(detail);
    expect(context!.summary).toContain("FY2027");
    expect(context!.summary).not.toContain("FY2026");
    expect(context!.source.href).toBe(
      `https://www.greenvillecounty.org/ManagementandBudget/pdf/2027/BudgetCombined.pdf#page=${printedPage + 1}`,
    );
    expect(context!.source.label).toContain(String(printedPage));
    expect(getServiceContext(entityId, 2028)).toBeUndefined();
  });

  function amount(entityId: string): string {
    const point = getV2EntityPage(entityId).series.find((point) => point.fiscal_year === 2027);
    expect(point, entityId).toBeDefined();
    return `$${point!.value!.toLocaleString("en-US")}`;
  }

  it("matches Administration, EMS and Road Program amounts to the exported FY2027 data", () => {
    const administration = getServiceContext("opcat.department-of-administration", 2027);
    expect(administration?.summary).toContain(amount("opcat.department-of-administration"));
    expect(administration?.summary).toContain(amount("dept.emergencymedicalservices"));
    expect(getServiceContext("fund.sr.road-program", 2027)?.summary).toContain(amount("fund.sr.road-program"));
  });

  it("keeps the FY2027 parks fund, spending and printed debt dash distinct", () => {
    const fund = getServiceContext("fund.sr.parks-recreation-tourism", 2027);
    const spending = getServiceContext("use.sr.parks-recreation-tourism", 2027);
    const debt = getServiceContext("use.debt.parks-recreation-tourism", 2027);
    expect(fund?.summary).toContain(amount("fund.sr.parks-recreation-tourism"));
    expect(fund?.summary).toContain(amount("use.sr.parks-recreation-tourism"));
    expect(fund?.summary).toContain("$4,185,084 in transfers out");
    expect(fund?.summary).toContain("$3,700,000 for capital projects");
    expect(fund?.summary).toContain("$460,084 for recreation revenue-bond debt");
    expect(fund?.summary).toContain("$25,000 for matching grants");
    expect(fund?.additionalSource?.href).toMatch(/2027\/BudgetCombined.pdf#page=48$/);
    expect(spending?.summary).toContain(amount("use.sr.parks-recreation-tourism"));
    expect(spending?.summary).toContain("$4,185,084 in transfers out");
    expect(spending?.searchSummary).toContain("Already included in the whole parks fund");
    const debtPoint = getV2EntityPage("use.debt.parks-recreation-tourism").series
      .find((point) => point.fiscal_year === 2027);
    expect(debtPoint?.printed_form).toBe("-");
    expect(debt?.summary).toContain("does not establish");
    expect(debt?.summary).toContain("$460,084");
    expect(debt?.additionalSource?.href).toMatch(/2027\/BudgetCombined.pdf#page=48$/);
  });

  it("cites FY2027 GreenLink identity and keeps historical-only explanations out of FY2027", () => {
    expect(getServiceContext("dept.outsideagencies", 2027)?.additionalSource?.href)
      .toMatch(/2027\/BudgetCombined.pdf#page=193$/);
    expect(getServiceContext("dept.emergencymedicalservices", 2027)?.changeNote).toBeUndefined();
    expect(getServiceContext("fund.sr.road-program", 2027)?.changeNote).toBeUndefined();
    expect(getServiceContext("fund.sr.road-paving", 2027)).toBeUndefined();
    expect(getServiceContext("dept.informationsystemsandservices", 2027)).toBeUndefined();
  });
});
