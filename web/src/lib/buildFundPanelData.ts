import {
  getChildrenForYear, getCoverageState, getDataNotes, getEntityPage,
  getGeneralFundBudgetActualComparison, getGeneralFundPageNotes, getGeneralFundYearGroups,
  getSeriesPointForYear, getSeriesValueForYear, getSources, getV2CoveredFiscalYears,
  getV2EntityIds, getV2EntityPage, getV2EntitySummary, getV2Statement, getV2StatementInstance,
} from "@/lib/loaders";
import type { CoverageDomain } from "@/lib/schema";
import type { FundCommon, FundGroupInput, GeneralFundInput, FundPanelInput, FundLabel } from "@/lib/fundPanelData";

function labelFor(entity: FundLabel): FundLabel {
  return { canonical_name: entity.canonical_name,
    ...(entity.display_name === undefined ? {} : { display_name: entity.display_name }),
    plain_language_description: entity.plain_language_description };
}

const GENERAL_STATEMENTS = [
  "gf.budget-sources", "gf.position", "gf.outflow", "gf.operating-overview",
  "gf.other-revenue-detail", "gf.transfer-in-detail", "gf.transfer-out-detail", "gf.actual-position",
];
const REVENUE_ENTITIES = [
  "rev.property-taxes", "rev.county-offices", "rev.intergovernmental", "rev.other",
  "rev.total-estimated-financial-sources",
];
const FUND_STATEMENTS: Record<string, Partial<Record<CoverageDomain, string>>> = {
  "fund.special-revenue": { inflow: "sr.inflow", position: "sr.position", outflow: "sr.outflow" },
  "fund.debt-service": { inflow: "debt.inflow", position: "debt.position", outflow: "debt.outflow" },
  // The printed usage/contribution lines are partial position evidence, in funding.
  "fund.enterprise": { inflow: "enterprise.funding", position: "enterprise.funding", outflow: "enterprise.outflow" },
};

/** Only loaders choose observations and coverage. Browser renderers receive their results. */
export function buildFundPanelData(entityId: string, years: number[]) {
  const common: FundCommon = { entities: {}, sources: {}, coveredYears: {} };
  const knownIds = new Set(getV2EntityIds());
  const addEntity = (id: string) => {
    const entity = getV2EntitySummary(id);
    if (entity) common.entities[id] = labelFor(entity);
    if (knownIds.has(id)) common.coveredYears[id] = getV2CoveredFiscalYears(getV2EntityPage(id));
  };
  for (const source of getSources()) common.sources[source.source_code] = {
    document_title_version: source.document_title_version,
    archive_url: source.archive_url, archived_on: source.archived_on,
  };
  addEntity(entityId);
  const panels: Record<number, FundPanelInput> = {};
  if (entityId === "fund.general") {
    const yearGroups = getGeneralFundYearGroups();
    const overviewName = getV2Statement("gf.operating-overview").canonical_name;
    REVENUE_ENTITIES.forEach(addEntity);
    for (const year of years) {
      const statements = Object.fromEntries(GENERAL_STATEMENTS.map(id => [id, getV2StatementInstance(id, year)]));
      for (const instance of Object.values(statements)) instance?.members.forEach(member => addEntity(member.entity_id));
      panels[year] = {
        kind: "general", year, yearGroups, overviewName, statements,
        pageNotes: getGeneralFundPageNotes(year), dataNotes: getDataNotes(year),
        comparison: getGeneralFundBudgetActualComparison(year),
        revenuePoints: Object.fromEntries(REVENUE_ENTITIES.map(id => [id,
          getV2EntityPage(id).series.find(point => point.fiscal_year === year && point.status_class === "estimated") ?? null,
        ])),
      } satisfies GeneralFundInput;
    }
  } else {
    const page = getEntityPage(entityId);
    const label = { entity_id: entityId, ...labelFor(page) };
    for (const year of years) {
      const members = {} as FundGroupInput["members"];
      const coverage = {} as FundGroupInput["coverage"];
      for (const domain of ["inflow", "position", "outflow"] as const) {
        coverage[domain] = getCoverageState(entityId, domain, year);
        const statementId = FUND_STATEMENTS[entityId]?.[domain];
        const allMembers = statementId ? getV2StatementInstance(statementId, year)?.members ?? [] : [];
        members[domain] = entityId === "fund.enterprise" && domain === "position"
          ? allMembers.filter(member => member.member_role === "net_change_funding") : allMembers;
        members[domain].forEach(member => addEntity(member.entity_id));
      }
      const children = getChildrenForYear(page, year).map(child => {
        addEntity(child.entity_id);
        const childPage = getEntityPage(child.entity_id);
        return { entity_id: child.entity_id, value: child.value,
          label: labelFor(childPage),
          point: getSeriesPointForYear(childPage, year) };
      });
      panels[year] = { kind: "group", year, page: label, children, coverage, members,
        point: getSeriesPointForYear(page, year), value: getSeriesValueForYear(page, year) } satisfies FundGroupInput;
    }
  }
  return { common, panels };
}
