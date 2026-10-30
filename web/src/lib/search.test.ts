import { describe, expect, it } from "vitest";

import { getSearchIndex } from "./loaders";
import { search } from "./search";
import { getSearchGuide } from "./serviceContext";
import type { SearchEntry } from "./schema";

const GIS_PAIR = [
  "dept.geographicinformationsystem",
  "dept.geographicinformationsystems",
] as const;
const PLANNING_PAIR = [
  "dept.planningandcodecompliance.communitydevelopmentandplanning",
  "dept.planningandcodecompliance.otherservices",
] as const;

function activeRange(entry: SearchEntry): string {
  return entry.active_from_fy !== null && entry.active_to_fy !== null
    ? `FY${entry.active_from_fy}–FY${entry.active_to_fy}`
    : "";
}

function renderedIdentity(entry: SearchEntry): string {
  return [
    entry.name,
    entry.qualifier,
    entry.domain_label,
    entry.fund_label ?? "",
    entry.entity_type === "department" ? entry.parent_label ?? "" : "",
    activeRange(entry),
  ].join(" | ");
}

function rangesOverlap(a: SearchEntry, b: SearchEntry): boolean {
  if (
    a.active_from_fy === null || a.active_to_fy === null
    || b.active_from_fy === null || b.active_to_fy === null
  ) return true;
  return a.active_from_fy <= b.active_to_fy && b.active_from_fy <= a.active_to_fy;
}

function identityCollisions(entries: SearchEntry[]): string[] {
  const collisions = new Set<string>();
  const byExactIdentity = new Map<string, SearchEntry[]>();
  for (const entry of entries) {
    const key = renderedIdentity(entry);
    byExactIdentity.set(key, [...(byExactIdentity.get(key) ?? []), entry]);
  }
  for (const group of byExactIdentity.values()) {
    if (group.length > 1) {
      collisions.add(group.map((entry) => entry.entity_id).sort().join(" / "));
    }
  }

  // Overlapping department ranges do not explain two simultaneous same-named lines. In
  // that case the parent operating category is required and must differ. This is the
  // corrected Planning and Code Compliance case the simpler tuple check cannot express:
  // FY2014–19 and FY2014–15 are different strings but overlap for two full years.
  const departments = entries.filter((entry) => entry.entity_type === "department");
  for (let left = 0; left < departments.length; left += 1) {
    for (let right = left + 1; right < departments.length; right += 1) {
      const a = departments[left];
      const b = departments[right];
      const sameBase = a.name === b.name
        && a.qualifier === b.qualifier
        && a.domain_label === b.domain_label
        && a.fund_label === b.fund_label;
      if (
        sameBase
        && rangesOverlap(a, b)
        && (!a.parent_label || a.parent_label === b.parent_label)
      ) {
        collisions.add([a.entity_id, b.entity_id].sort().join(" / "));
      }
    }
  }
  return [...collisions].sort();
}

/**
 * The spec's five example searches (architecture spec, Step 7). These are the queries a
 * resident actually types, and each was chosen because it exercises a different way the
 * county's own vocabulary fails a reader.
 */
describe("the spec's example searches", () => {
  const index = getSearchIndex();
  const idsFor = (query: string) => search(index, query).map((r) => r.entry.entity_id);

  it("'property tax' finds the General Fund revenue source", () => {
    const results = search(index, "property tax");
    expect(results[0].entry.entity_id).toBe("rev.property-taxes");
    expect(results[0].entry.domain_label).toBe("Money in");
    expect(results[0].entry.fund_label).toBe("General Fund");
  });

  it("'deputies' finds the Sheriff", () => {
    expect(idsFor("deputies")[0]).toBe("dept.sheriff");
  });

  it("'reserves' finds the fund-balance concepts", () => {
    // The terminology note is the entity's own restriction note, rendered on its page:
    // fund balance is an accounting position, not money in an account.
    expect(idsFor("reserves")).toContain("balance.gf.unassigned");
  });

  it("'transfers' returns transfers in and transfers out as DISTINCT results", () => {
    const results = search(index, "transfers");
    const ids = results.map((r) => r.entry.entity_id);
    expect(ids).toContain("fin.gf.transfers-in");
    expect(ids).toContain("fin.gf.transfers-out");

    // And they must be distinguishable once found, or two rows reading "Transfers" are
    // worse than one: the reader cannot tell which is which.
    const inbound = results.find((r) => r.entry.entity_id === "fin.gf.transfers-in");
    const outbound = results.find((r) => r.entry.entity_id === "fin.gf.transfers-out");
    expect(inbound!.entry.domain_label).toBe("Money in");
    expect(outbound!.entry.domain_label).toBe("Money out");
  });

  it("'roads' returns several lines, not one undifferentiated road budget", () => {
    const ids = idsFor("roads");
    expect(ids).toContain("fund.sr.road-program");
    expect(ids).toContain("dept.engineeringandroadbureaus");
    expect(ids.length).toBeGreaterThan(1);
  });
});

describe("ranking", () => {
  const index = getSearchIndex();

  it("puts an exact alias above a substring match", () => {
    const results = search(index, "jail");
    expect(results[0].entry.entity_id).toBe("dept.detentioncenter");
  });

  it("does not guess at a misspelling", () => {
    // A typo that silently lands a resident on a different department is worse than a
    // dead end, because the dead end is visible and the wrong answer is not.
    expect(search(index, "sherrif")).toHaveLength(0);
  });

  it("returns nothing for a subject the site does not cover", () => {
    // Solid waste is not a General Fund department and no alias points at it. An empty
    // result is the honest answer; the search page says so in words.
    expect(search(index, "garbage collection")).toHaveLength(0);
  });

  it("does not turn the word bus into the Enterprise Fund's business description", () => {
    expect(search(index, "bus")).toEqual([]);
  });

  it("gives every result a domain and a fund label", () => {
    for (const { entry } of search(index, "tax", 100)) {
      expect(entry.domain_label, entry.entity_id).toBeTruthy();
      expect(entry.fund_label, entry.entity_id).toBeTruthy();
    }
  });

  it("puts current General Fund public safety uses ahead of zero debt-service lines", () => {
    const results = search(index, "public safety");
    const firstDebt = results.findIndex((result) => result.entry.fund_id === "fund.debt-service");
    const firstGeneralFundUse = results.findIndex((result) => (
      result.entry.fund_id === "fund.general"
      && result.entry.domain_label === "Money out"
      && result.entry.active_to_fy === 2026
    ));
    expect(firstGeneralFundUse).toBeGreaterThanOrEqual(0);
    expect(firstDebt).toBeGreaterThan(firstGeneralFundUse);
  });

  it("returns a labeled transit guide without inventing a transit entity", () => {
    for (const query of ["transit", "public transit", "Greenlink", "GTA", "bus"]) {
      const guide = getSearchGuide(query);
      expect(guide, query).toBeDefined();
      expect(guide!.href).toBe("/e/dept.outsideagencies/");
      expect(guide!.summary).toContain("not transit alone");
    }
  });
});

describe("aliases reach the CURRENT entity, not only defunct ones", () => {
  const index = getSearchIndex();

  it("'zoning' finds the department that exists today", () => {
    // Regression: the two defunct planning departments (FY2008-09, FY2010-13) carried
    // "zoning" and the current one (FY2020-2026) did not, so this query answered
    // exclusively with entities that stopped existing in 2013.
    const results = search(index, "zoning");
    expect(results.map((r) => r.entry.entity_id)).toContain("dept.planning");
    const current = results.find((r) => r.entry.entity_id === "dept.planning");
    expect(current!.entry.active_to_fy).toBe(2026);
  });

  it("leaves no current-era General Fund department unsearchable by name", () => {
    // Every department active through FY2026 must be findable by its own canonical name,
    // which is the floor below aliases: a department nobody can reach is invisible.
    const current = index.filter(
      (e) => e.entity_id.startsWith("dept.") && e.active_to_fy === 2026,
    );
    expect(current.length).toBeGreaterThan(10);
    for (const entry of current) {
      const ids = search(index, entry.name).map((r) => r.entry.entity_id);
      expect(ids, `${entry.entity_id} (${entry.name})`).toContain(entry.entity_id);
    }
  });
});

describe("rendered search-result identity", () => {
  const index = getSearchIndex();

  it("has no indistinguishable shipped results, including overlapping departments", () => {
    expect(index.length).toBeGreaterThan(250);
    expect(identityCollisions(index)).toEqual([]);
  });

  it("names the GIS pair when its range and parent disambiguators are removed", () => {
    const weakened = index.map((entry) => GIS_PAIR.includes(entry.entity_id as typeof GIS_PAIR[number])
      ? { ...entry, active_from_fy: null, active_to_fy: null, parent_label: null }
      : entry);
    const collisions = identityCollisions(weakened);
    expect(collisions).toContain([...GIS_PAIR].sort().join(" / "));
  });

  it("names the overlapping Planning and Code Compliance pair when parent is removed", () => {
    const weakened = index.map((entry) =>
      PLANNING_PAIR.includes(entry.entity_id as typeof PLANNING_PAIR[number])
        ? { ...entry, parent_label: null }
        : entry);
    const collisions = identityCollisions(weakened);
    expect(collisions).toContain([...PLANNING_PAIR].sort().join(" / "));
  });
});

describe("fund descriptions are not searched", () => {
  const index = getSearchIndex();
  const idsFor = (query: string) => search(index, query).map((r) => r.entry.entity_id);

  it("does not open a fund for a service named in its plain-language description", () => {
    expect(idsFor("parks")).not.toContain("fund.special-revenue");
    expect(idsFor("roads")).not.toContain("fund.general");
    expect(idsFor("deputies")).not.toContain("fund.general");
  });

  it("still finds a fund by its name", () => {
    expect(idsFor("special revenue")).toContain("fund.special-revenue");
    expect(idsFor("general fund")).toContain("fund.general");
  });
});
