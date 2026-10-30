import { FUND_BALANCE_CONTEXT } from "@/lib/readingContext";
import type { ProvenanceSource } from "@/components/Provenance";
import { displayName } from "@/lib/format";
import {
  getChildrenForYear,
  getCoverageState,
  getEntityPage,
  getEntitySummary,
  getLatestFiscalYear,
  getSeriesPointForYear,
  getSourceByCode,
  getV2Relationships,
  getV2EntityPage,
  getV2EntitySummary,
  getV2StatementInstance,
  isV2FiscalYearCovered,
} from "@/lib/loaders";
import type { Citation, V2Statement } from "@/lib/schema";
import type { RiverModel, RiverNode } from "@/lib/river";
import { getServiceContext } from "@/lib/serviceContext";

const FUND_IDS = [
  "fund.general",
  "fund.special-revenue",
  "fund.debt-service",
  "fund.enterprise",
] as const;

const FUND_COLORS: Record<string, string> = {
  "fund.general": "#00795A",
  "fund.special-revenue": "#C99320",
  "fund.debt-service": "#B23A24",
  "fund.enterprise": "#5A52A6",
};

const RIVER_COLORS = {
  revenue: "#147E93",
  transfer: "#C99320",
  reserve: "#6B6862",
  use: "#B23A24",
} as const;
const GENERAL_RIVER_START_YEAR = 2018;

type StatementMember = V2Statement["instances"][number]["members"][number];

function statusLabel(status: string | null): string {
  if (status === "adopted") return "Adopted";
  if (status === "actual") return "Actual";
  if (status === "projected") return "Projected";
  if (status === "financing") return "Financing";
  return "Estimated";
}

function provenance(citation: Citation, status: string | null, fiscalYear: number): ProvenanceSource {
  const source = getSourceByCode(citation.source_code);
  return {
    sourceCode: citation.source_code,
    bookTitle: source?.document_title_version ?? citation.source_code,
    printedPage: citation.printed_page,
    url: citation.source_url,
    statusLabel: statusLabel(status),
    archiveUrl: source?.archive_url,
    archivedOn: source?.archived_on,
    pageFiscalYear: fiscalYear,
  };
}

function nodeCitation(citation: Citation): RiverNode["citation"] {
  return {
    sourceUrl: citation.source_url,
    sourceCode: citation.source_code,
    printedPage: citation.printed_page,
    pdfPage: citation.pdf_page,
  };
}

function hrefFor(entityId: string, fiscalYear: number): string | null {
  return isV2FiscalYearCovered(entityId, fiscalYear) ? `/e/${entityId}/?fy=${fiscalYear}` : null;
}

/**
 * Financing and fund-balance canonical series can be audited actuals in historic years,
 * while the river is specifically showing the adopted budget statement. Keep these
 * branches on that statement's named sections rather than routing to a mismatched series.
 */
function statementHref(fiscalYear: number, fragment: "money-in" | "money-out" | "summary"): string | null {
  const fundHref = hrefFor("fund.general", fiscalYear);
  return fundHref ? `${fundHref}#${fragment}` : null;
}

function memberNode(
  member: StatementMember,
  fiscalYear: number,
  kind: RiverNode["kind"],
  color: string,
  description: string,
  label?: string,
): RiverNode | null {
  if (member.value === null || member.value < 0 || !member.citation) return null;
  const entity = getV2EntitySummary(member.entity_id);
  return {
    id: member.entity_id,
    label: label ?? (displayName(entity) || member.entity_id),
    value: member.value,
    printedForm: member.printed_form,
    kind,
    href: hrefFor(member.entity_id, fiscalYear),
    description,
    citation: nodeCitation(member.citation),
    color,
  };
}

function sum(nodes: RiverNode[]): number {
  return nodes.reduce((total, node) => total + node.value, 0);
}

function reconciled(statementId: string, fiscalYear: number) {
  const instance = getV2StatementInstance(statementId, fiscalYear);
  return instance?.validation_status === "reconciled" ? instance : null;
}

function hasStatus(member: StatementMember | undefined, status: string): member is StatementMember {
  return Boolean(member && member.resolved_status_class === status);
}

function allHaveStatus(members: StatementMember[], status: string): boolean {
  return members.length > 0 && members.every((member) => member.resolved_status_class === status);
}

function relationshipApplies(rel: ReturnType<typeof getV2Relationships>[number], fiscalYear: number): boolean {
  return (rel.effective_from_fy === null || rel.effective_from_fy <= fiscalYear)
    && (rel.effective_to_fy === null || rel.effective_to_fy >= fiscalYear);
}

type OperatingPartition = { nodes: RiverNode[]; groupingNote: string };

/**
 * Use the department-view categories only when that complete published partition can be
 * tied to the adopted operating and financing statement totals. A null category is an
 * evidence gap, not an invitation to silently leave a service out of the river.
 */
function detailedOperatingPartition(
  fiscalYear: number,
  operatingTotal: number,
  transferOut: number,
  authority: number,
): OperatingPartition | null {
  const children = getChildrenForYear(getEntityPage("gf.expenditures"), fiscalYear);
  if (children.length === 0) return null;

  const points = children.map((child) => {
    const point = getSeriesPointForYear(getEntityPage(child.entity_id), fiscalYear);
    const summary = getEntitySummary(child.entity_id);
    return point && summary && child.value !== null
      && point.value !== null && point.value >= 0 && point.value === child.value
      && point.status_class === "adopted" && point.citation
      ? { child, point, summary }
      : null;
  });
  if (points.some((item) => item === null)) return null;
  const partition = points as Array<NonNullable<(typeof points)[number]>>;
  const financing = partition.find((item) => item.child.entity_id === "opcat.other-financing-uses");
  if (!financing || financing.point.value !== transferOut) return null;

  const operating = partition.filter((item) => item !== financing);
  if (operating.length === 0
    || partition.reduce((total, item) => total + item.point.value, 0) !== authority
    || operating.reduce((total, item) => total + item.point.value, 0) !== operatingTotal) return null;

  const nodes = operating.map(({ child, point, summary }) => ({
    id: child.entity_id,
    label: displayName(summary),
    value: point.value,
    printedForm: point.printed_form,
    kind: "use" as const,
    href: hrefFor(child.entity_id, fiscalYear),
    description: operatingCategoryExamples(child.entity_id, fiscalYear)
      ?? "A published General Fund operating category in the department view. It is not matched to a particular revenue source.",
    citation: nodeCitation(point.citation),
    color: RIVER_COLORS.use,
  }));
  if (nodes.some((node) => node.href === null)) return null;
  return {
    nodes,
    groupingNote: `Spending branches use FY${fiscalYear}'s published department-view categories. Their available department detail is year-specific; this grouping can differ from the broad operating overview used in other years.`,
  };
}

/**
 * Add examples only when the rendered node itself owns explicit, year-valid `contains`
 * relationships. Parallel overview presentations have no safe implied crosswalk to the
 * department hierarchy, so they retain the generic scope note until a source-backed link
 * is added to the data.
 */
function categoryServices(entityId: string, fiscalYear: number): NonNullable<RiverNode["serviceExamples"]> {
  const relationships = getV2Relationships();
  const children = relationships
    .filter((rel) => rel.from_entity_id === entityId && rel.relationship_type === "contains" && relationshipApplies(rel, fiscalYear))
    .map((rel) => rel.to_entity_id)
    .filter((entityId, index, ids) => ids.indexOf(entityId) === index)
    .map((entityId) => {
      const page = getV2EntityPage(entityId);
      const point = page.series.find((item) => item.fiscal_year === fiscalYear);
      const summary = getV2EntitySummary(entityId);
      if (point?.status_class !== "adopted" || point.value === null || point.value <= 0
        || !point.citation || !summary || !isV2FiscalYearCovered(entityId, fiscalYear)) return null;
      const href = `/e/${entityId}/?fy=${fiscalYear}`;
      return {
        ...withServiceContext({
          id: entityId,
          label: displayName(summary) || summary.canonical_name,
          value: point.value,
          printedForm: point.printed_form,
          href,
          kind: "use",
          description: summary.plain_language_description,
          citation: nodeCitation(point.citation),
          color: RIVER_COLORS.use,
        }, fiscalYear, false),
        href,
      };
    })
    .filter((child): child is RiverNode & { href: string } => child !== null)
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, 3);
  return children;
}

function operatingCategoryExamples(entityId: string, fiscalYear: number): string | null {
  const children = categoryServices(entityId, fiscalYear);
  if (children.length === 0) return null;
  const labels = children.map((child) => child.officialLabel ?? child.label);
  const exampleText = labels.length === 1
    ? labels[0]
    : labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
  return `Includes ${exampleText}. Open the detail for the published category and its reporting boundaries.`;
}

/** Add explanation without changing the reconciled accounting partition or its amounts. */
function withServiceContext(node: RiverNode, fiscalYear: number, includeExamples = true): RiverNode {
  const context = getServiceContext(node.id, fiscalYear);
  const serviceExamples = includeExamples && node.kind === "use" ? categoryServices(node.id, fiscalYear) : [];
  const shortLabel = context?.shortLabel;
  return {
    ...node,
    ...(shortLabel && shortLabel !== node.label ? { label: shortLabel, officialLabel: node.label } : {}),
    ...(serviceExamples.length ? { serviceExamples } : {}),
    ...(context ? { context: {
      title: context.title,
      summary: context.summary,
      sources: [context.source, ...(context.additionalSource ? [context.additionalSource] : [])],
    } } : {}),
  };
}

/**
 * Four published fund budgets, not a consolidated countywide revenue flow.
 * A source node is intentionally absent because transfers and reserves make
 * the four fund funding statements non-additive at county scope.
 */
export function getCountyRiver(fiscalYear: number): RiverModel | null {
  const totalPoint = getSeriesPointForYear(getEntityPage("budget.total"), fiscalYear);
  if (!totalPoint || totalPoint.value < 0 || totalPoint.status_class !== "adopted") return null;

  const uses: RiverNode[] = [];
  for (const fundId of FUND_IDS) {
    const point = getSeriesPointForYear(getEntityPage(fundId), fiscalYear);
    const summary = getEntitySummary(fundId);
    if (!point || point.value === null || point.value < 0 || point.status_class !== totalPoint.status_class || !summary) return null;
    uses.push({
      id: fundId,
      label: displayName(summary),
      value: point.value,
      printedForm: point.printed_form,
      kind: "fund",
      href: hrefFor(fundId, fiscalYear),
      description: summary.plain_language_description,
      citation: nodeCitation(point.citation),
      color: FUND_COLORS[fundId],
    });
  }
  if (sum(uses) !== totalPoint.value) return null;

  const coverage = getCoverageState("budget.total", "inflow", fiscalYear);
  return {
    id: "county",
    fiscalYear,
    title: `FY${fiscalYear} four-fund budget authority`,
    authority: totalPoint.value,
    // Keeps the duplication mechanism, not just the perimeter. The plan's proposed wording
    // ("including transfers between them") drops the reason a dollar can appear twice, and
    // this label is also what the county CSV download serialises, so it is the only place a
    // reuser sees it.
    centerLabel: "County-published total of four fund groups; a transfer between them is counted in both",
    sources: [],
    uses: uses.map((node) => withServiceContext(node, fiscalYear)),
    reserve: null,
    sourceTotal: null,
    coverageNote: `Countywide revenue is not shown. ${coverage.gap_note}`,
    source: provenance(totalPoint.citation, totalPoint.status_class, fiscalYear),
  };
}

/**
 * A conservative General Fund source/use model. It is withheld unless the
 * source statement, operating overview, position statement, and outflow
 * statement all reconcile and every rendered node retains a source citation.
 */
export function getGeneralFundRiver(fiscalYear: number): RiverModel | null {
  const budgetSources = reconciled("gf.budget-sources", fiscalYear);
  const outflow = reconciled("gf.outflow", fiscalYear);
  const position = reconciled("gf.position", fiscalYear);
  const operatingOverview = reconciled("gf.operating-overview", fiscalYear);
  const authorityPoint = getSeriesPointForYear(getEntityPage("fund.general"), fiscalYear);
  if (!budgetSources || !outflow || !position || !operatingOverview || !authorityPoint) return null;

  const revenueTotal = budgetSources.members.find((member) => member.member_role === "revenue");
  const transferIn = budgetSources.members.find((member) => member.member_role === "financing_in");
  const plannedDraw = budgetSources.members.find((member) => member.member_role === "planned_balance_use");
  const totalBudget = budgetSources.members.find((member) => member.member_role === "total_budget");
  const positionNetChange = position.members.find((member) => member.member_role === "net_change");
  if (!hasStatus(revenueTotal, "estimated") || !hasStatus(transferIn, "financing")
    || !hasStatus(plannedDraw, "estimated") || !hasStatus(totalBudget, "adopted")
    || !hasStatus(positionNetChange, "estimated") || authorityPoint.status_class !== "adopted"
    || revenueTotal.value === null || revenueTotal.value < 0 || transferIn.value === null || transferIn.value < 0 || plannedDraw.signed_value === null
    || totalBudget.value === null || totalBudget.value < 0 || !plannedDraw.citation || positionNetChange.value === null
    || totalBudget.value !== authorityPoint.value || positionNetChange.value !== plannedDraw.value) return null;

  // The first river release supports a draw from fund balance. A positive net change is a
  // contribution to fund balance and needs a visibly different diagram, so hold it.
  if (plannedDraw.signed_value <= 0) return null;

  const revenueChildren = getChildrenForYear(getEntityPage("rev.total-estimated-financial-sources"), fiscalYear);
  if (revenueChildren.length === 0) return null;
  const revenueNodes = revenueChildren.map((child) => {
    if (child.value === null) return null;
    const point = getSeriesPointForYear(getEntityPage(child.entity_id), fiscalYear);
    const summary = getEntitySummary(child.entity_id);
    if (!point || point.value < 0 || point.status_class !== "estimated" || !summary) return null;
    return {
      id: child.entity_id,
      label: displayName(summary),
      value: child.value,
      printedForm: child.printed_form,
      kind: "revenue" as const,
      href: hrefFor(child.entity_id, fiscalYear),
      description: summary.plain_language_description,
      citation: nodeCitation(point.citation),
      color: RIVER_COLORS.revenue,
    };
  });
  if (revenueNodes.some((node) => node === null)) return null;
  const sources = (revenueNodes as RiverNode[]).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sum(sources) !== revenueTotal.value) return null;

  const transferNode = memberNode(
    transferIn,
    fiscalYear,
    "transfer",
    RIVER_COLORS.transfer,
    "Money budgeted to enter the General Fund from other county funds. It is not new countywide revenue.",
    "Transfers in from other funds",
  );
  if (!transferNode || !plannedDraw.citation || plannedDraw.value >= 0 || plannedDraw.signed_value !== -plannedDraw.value) return null;
  transferNode.href = statementHref(fiscalYear, "money-in");
  if (!transferNode.href) return null;
  const reserve: RiverNode = {
    id: plannedDraw.entity_id,
    label: "Planned use of fund balance",
    value: plannedDraw.signed_value,
    printedForm: plannedDraw.printed_form,
    kind: "reserve",
    href: statementHref(fiscalYear, "summary"),
    description: `Planned use of fund balance, separate from money coming in. ${FUND_BALANCE_CONTEXT}`,
    citation: nodeCitation(plannedDraw.citation),
    color: RIVER_COLORS.reserve,
  };
  if (!reserve.href) return null;
  sources.push(transferNode);

  const operatingTotal = outflow.members.find((member) => member.member_role === "operating_uses");
  const transferOut = outflow.members.find((member) => member.member_role === "financing_out");
  if (!hasStatus(operatingTotal, "adopted") || !hasStatus(transferOut, "adopted")
    || operatingTotal.value === null || transferOut.value === null || operatingTotal.value < 0 || transferOut.value < 0) return null;

  const overviewUseNodes = operatingOverview.members
    .filter((member) => member.member_role === "operating_overview_category")
    .map((member) => memberNode(
      member,
      fiscalYear,
      "use",
      RIVER_COLORS.use,
      operatingCategoryExamples(member.entity_id, fiscalYear)
        ?? "A published General Fund operating category. It is not matched to a particular revenue source.",
    ));
  if (overviewUseNodes.length === 0 || overviewUseNodes.some((node) => node === null)
    || !allHaveStatus(operatingOverview.members.filter((member) => member.member_role === "operating_overview_category"), "adopted")) return null;
  const detailedPartition = detailedOperatingPartition(
    fiscalYear,
    operatingTotal.value,
    transferOut.value,
    authorityPoint.value,
  );
  const uses = (detailedPartition?.nodes ?? overviewUseNodes as RiverNode[])
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sum(uses) !== operatingTotal.value) return null;

  const transferOutNode = memberNode(
    transferOut,
    fiscalYear,
    "transfer",
    RIVER_COLORS.transfer,
    "Money budgeted to leave the General Fund for another purpose or fund. It is not a county service category.",
    "Transfers out to other funds",
  );
  if (!transferOutNode) return null;
  transferOutNode.href = statementHref(fiscalYear, "money-out");
  if (!transferOutNode.href) return null;
  uses.push(transferOutNode);

  const sourceTotal = sum(sources);
  if (sourceTotal + reserve.value !== authorityPoint.value || sum(uses) !== authorityPoint.value) return null;

  return {
    id: "general",
    fiscalYear,
    title: `FY${fiscalYear} General Fund: sources and uses`,
    authority: authorityPoint.value,
    centerLabel: "the most it can spend this year",
    sources,
    uses: uses.map((node) => withServiceContext(node, fiscalYear)),
    reserve,
    sourceTotal,
    coverageNote: `Source branches fund the General Fund, not a consolidated countywide revenue statement. Transfers and use of fund balance are shown separately from revenue. ${detailedPartition?.groupingNote ?? `Spending branches use FY${fiscalYear}'s broad operating overview because the department-view category series is incomplete for this year.`}`,
    source: provenance(authorityPoint.citation, authorityPoint.status_class, fiscalYear),
  };
}

/** Fiscal years whose entire General Fund river passes the source and arithmetic gates. */
export function getRiverYears(): number[] {
  const years: number[] = [];
  for (let fiscalYear = GENERAL_RIVER_START_YEAR; fiscalYear <= getLatestFiscalYear(); fiscalYear += 1) {
    if (getGeneralFundRiver(fiscalYear)) years.push(fiscalYear);
  }
  return years;
}
