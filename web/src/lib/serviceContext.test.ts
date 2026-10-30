import { describe, expect, it } from "vitest";

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
