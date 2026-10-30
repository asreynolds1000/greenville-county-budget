/**
 * Build-time (Node/SSG) data loaders. Every function here reads a file from
 * web/data via fs and validates it through the schemas in schema.ts before
 * returning — the app never trusts unparsed JSON, and never imports the raw
 * files directly into a client component (that would ship all 134 pages into
 * the client bundle).
 *
 * These loaders only run at build time (generateStaticParams, generateMetadata,
 * and Server Components in a static-export app all execute at `next build`,
 * never in the browser).
 */
import fs from "node:fs";
import path from "node:path";

import {
  entitiesFileSchema,
  entityPageSchema,
  generalFundBudgetActualComparisonSchema,
  generalFundComparisonIndexSchema,
  sourcesFileSchema,
  yearsFileSchema,
  type ChildRef,
  type EntityPage,
  type EntitySummary,
  type GeneralFundBudgetActualComparison,
  type GeneralFundComparisonSection,
  type ParentRef,
  type SeriesPoint,
  type Source,
  type V2EntityPage,
  type V2EntitySummary,
  type V2Relationship,
  type V2Statement,
  type YearCoverage,
  v2EntitiesFileSchema,
  v2EntityPageSchema,
  v2RelationshipsFileSchema,
  v2StatementsFileSchema,
  dataNotesFileSchema,
  correctionsFileSchema,
  pendingYearsFileSchema,
  searchIndexFileSchema,
  v2CoverageFileSchema,
  verificationFileSchema,
  type CoverageDomain,
  type DataNote,
  type Correction,
  type PendingYear,
  type SearchEntry,
  type V2Coverage,
  type VerificationYear,
} from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson(relPath: string): unknown {
  const filePath = path.join(DATA_DIR, relPath);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

let entitiesCache: EntitySummary[] | null = null;

/** The entity dimension: id, name, type, aliases, description, active FY range. */
export function getEntities(): EntitySummary[] {
  if (!entitiesCache) {
    entitiesCache = entitiesFileSchema.parse(readJson("entities.json"));
  }
  return entitiesCache;
}

export function getEntityIds(): string[] {
  return getEntities().map((entity) => entity.entity_id);
}

export function getEntitySummary(entityId: string): EntitySummary | undefined {
  return getEntities().find((entity) => entity.entity_id === entityId);
}

let sourcesCache: Source[] | null = null;

/** The source registry: book titles, official URLs, publication order. */
export function getSources(): Source[] {
  if (!sourcesCache) {
    sourcesCache = sourcesFileSchema.parse(readJson("sources.json"));
  }
  return sourcesCache;
}

let yearsCache: Record<string, YearCoverage> | null = null;

/** Per-year coverage/status summary, keyed by fiscal year string ("2002".."2027"). */
export function getYears(): Record<string, YearCoverage> {
  if (!yearsCache) {
    yearsCache = yearsFileSchema.parse(readJson("years.json"));
  }
  return yearsCache;
}

const pageCache = new Map<string, EntityPage>();

/** One entity's full cross-year page data (series, children, parents, breaks, citations). */
export function getEntityPage(entityId: string): EntityPage {
  const cached = pageCache.get(entityId);
  if (cached) return cached;
  const page = entityPageSchema.parse(readJson(path.join("pages", `${entityId}.json`)));
  pageCache.set(entityId, page);
  return page;
}

/**
 * The newest fiscal year this site actually holds, derived rather than declared.
 *
 * Three constants used to carry the year independently — the home page, its whole-budget
 * download href, and the methodology coverage matrix — with nothing checking they agreed.
 * Worse, the home page called it "this year": Greenville County's FY2027 began on 1 July
 * 2026, so from that date the landing page described a fiscal year that had ended as the
 * current one. A site whose subject is fiscal years cannot get its own fiscal year wrong.
 *
 * This is deliberately NOT "the current fiscal year". It is the latest year we have, which
 * is the only claim the data supports. The copy says so.
 */
export function getLatestFiscalYear(): number {
  const years = getCoveredFiscalYears(getEntityPage("budget.total"));
  return years[years.length - 1];
}

const GLOBAL_MIN_FY = 2002;
const GLOBAL_MAX_FY = 2026;

/**
 * The full range of fiscal years this entity is "on the map" for, per
 * entities.json active_from_fy/active_to_fy. Both null (top-level aggregates
 * like budget.total, gf.expenditures) means active for the whole tracked
 * range — the entity's own series can still have real gaps inside that range
 * (e.g. gf.expenditures has no adopted value for FY2002-03: department detail
 * exists only as actual/projected those years — see napkin). A gap inside the
 * active range is honest absence (plan T1), not a reason to shrink the range;
 * getSeriesValueForYear returns null for those years rather than omitting the
 * page entirely.
 */
export function getCoveredFiscalYears(page: EntityPage): number[] {
  const from = page.active_from_fy ?? GLOBAL_MIN_FY;
  const to = page.active_to_fy ?? GLOBAL_MAX_FY;
  const years: number[] = [];
  for (let year = from; year <= to; year++) years.push(year);
  return years;
}

/** The most recent fiscal year this entity is covered for — the default /e/[id] view. */
export function getLatestCoveredYear(page: EntityPage): number {
  const years = getCoveredFiscalYears(page);
  return years[years.length - 1];
}

/** Whether `fiscalYear` falls inside this entity's covered range (see getCoveredFiscalYears). */
export function isCoveredFiscalYear(page: EntityPage, fiscalYear: number): boolean {
  return getCoveredFiscalYears(page).includes(fiscalYear);
}

/**
 * This entity's own canonical value for one fiscal year, or null if no
 * canonical value of its status class was published that year. NEVER 0 for
 * "unpublished" — a source observation represented arithmetically as $0 has a
 * series entry with value 0 and retains its `printed_form`; an unpublished year
 * has no series entry at all, which is exactly what this function turns into null.
 */
export function getSeriesValueForYear(page: EntityPage, fiscalYear: number): number | null {
  const point = page.series.find((s) => s.fiscal_year === fiscalYear);
  return point ? point.value : null;
}

/**
 * The full canonical observation for one fiscal year (value, citation,
 * status class, reconciliation, alternatives) — or null if this entity has
 * no canonical value of its status class that year. Use this over
 * getSeriesValueForYear whenever the caller needs the citation (Provenance,
 * Figure source affordances), not just the dollar amount.
 */
export function getSeriesPointForYear(page: EntityPage, fiscalYear: number): SeriesPoint | null {
  return page.series.find((s) => s.fiscal_year === fiscalYear) ?? null;
}

/** Looks up a source's full book title/URL by the source_code on a citation (e.g. "FY2026"). */
export function getSourceByCode(sourceCode: string): Source | undefined {
  return getSources().find((source) => source.source_code === sourceCode);
}

/** Era-correct children for one fiscal year (empty array if this entity has no children). */
export function getChildrenForYear(page: EntityPage, fiscalYear: number): ChildRef[] {
  return page.children_by_year[String(fiscalYear)] ?? [];
}

/** Era-correct parent(s) for one fiscal year. Can be length 2 in a genuine dual-parent overlap
 * year (dept.propertymanagement, dept.animalcareservices — see napkin "Step 2 export_app.py
 * findings"); never silently collapsed to one. */
export function getParentsForYear(page: EntityPage, fiscalYear: number): ParentRef[] {
  return page.parent_by_year[String(fiscalYear)] ?? [];
}

let v2EntitiesCache: V2EntitySummary[] | null = null;

/** All accounting entities, including balances, financing, and overview categories. */
export function getV2Entities(): V2EntitySummary[] {
  if (!v2EntitiesCache) {
    v2EntitiesCache = v2EntitiesFileSchema.parse(readJson(path.join("v2", "entities.json")));
  }
  return v2EntitiesCache;
}

export function getV2EntityIds(): string[] {
  return getV2Entities().map((entity) => entity.entity_id);
}

export function getV2EntitySummary(entityId: string): V2EntitySummary | undefined {
  return getV2Entities().find((entity) => entity.entity_id === entityId);
}

let v2RelationshipsCache: V2Relationship[] | null = null;

export function getV2Relationships(): V2Relationship[] {
  if (!v2RelationshipsCache) {
    v2RelationshipsCache = v2RelationshipsFileSchema.parse(
      readJson(path.join("v2", "relationships.json")),
    );
  }
  return v2RelationshipsCache;
}

const v2PageCache = new Map<string, V2EntityPage>();

export function getV2EntityPage(entityId: string): V2EntityPage {
  const cached = v2PageCache.get(entityId);
  if (cached) return cached;
  const page = v2EntityPageSchema.parse(
    readJson(path.join("v2", "pages", `${entityId}.json`)),
  );
  v2PageCache.set(entityId, page);
  return page;
}

let v2StatementsCache: V2Statement[] | null = null;

export function getV2Statements(): V2Statement[] {
  if (!v2StatementsCache) {
    v2StatementsCache = v2StatementsFileSchema.parse(
      readJson(path.join("v2", "statements.json")),
    );
  }
  return v2StatementsCache;
}

export function getV2Statement(statementId: string): V2Statement {
  const statement = getV2Statements().find((item) => item.statement_id === statementId);
  if (!statement) throw new Error(`Unknown v2 statement: ${statementId}`);
  return statement;
}

export function getV2StatementInstance(statementId: string, fiscalYear: number) {
  return getV2Statement(statementId).instances.find(
    (instance) => instance.fiscal_year === fiscalYear,
  ) ?? null;
}

export function getV2CoveredFiscalYears(page: V2EntityPage): number[] {
  return [...new Set(page.series.map((point) => point.fiscal_year))].sort((a, b) => a - b);
}

/** Whether this entity's source-backed series covers the requested fiscal year. */
export function isV2FiscalYearCovered(entityId: string, fiscalYear: number): boolean {
  if (!getV2EntityIds().includes(entityId)) return false;
  return getV2CoveredFiscalYears(getV2EntityPage(entityId)).includes(fiscalYear);
}

let coverageCache: V2Coverage[] | null = null;

/** Every coverage state: what this site covers, per scope, per domain, per year. */
export function getCoverage(): V2Coverage[] {
  if (!coverageCache) {
    coverageCache = v2CoverageFileSchema.parse(readJson(path.join("v2", "coverage.json")));
  }
  return coverageCache;
}

/**
 * The coverage state for one region of one page.
 *
 * Throws rather than returning null when a state is missing, and that is deliberate. A
 * missing state means a region would render with nothing in it and no words explaining
 * why, which is the single failure the county overview exists to prevent. The pipeline
 * gate (`_check_scope_coverage`) already refuses to build a dataset with a hole in it;
 * this is the same refusal one layer up, so a page cannot quietly outrun its data.
 */
export function getCoverageState(
  scopeEntityId: string,
  domain: CoverageDomain,
  fiscalYear: number,
): V2Coverage {
  const state = getCoverage().find(
    (row) => row.scope_entity_id === scopeEntityId
      && row.domain === domain
      && row.fiscal_year === fiscalYear,
  );
  if (!state) {
    throw new Error(
      `No coverage state for ${scopeEntityId}/${domain}/FY${fiscalYear}. Every region that `
      + "renders must state what it covers; add the row to data/production/scope_coverage.csv.",
    );
  }
  return state;
}

let searchIndexCache: SearchEntry[] | null = null;

/** The static search index: every line, its aliases, its domain and its fund. */
export function getSearchIndex(): SearchEntry[] {
  if (!searchIndexCache) {
    searchIndexCache = searchIndexFileSchema.parse(
      readJson(path.join("v2", "search-index.json")),
    );
  }
  return searchIndexCache;
}

let correctionsCache: { data_version: string; corrections: Correction[] } | null = null;

/**
 * The corrections log and the data version.
 *
 * The version is a hash of the published data, not a build timestamp: it changes when the
 * numbers change and not otherwise, so a citation to this site at a point in time stays
 * resolvable.
 */
export function getCorrections(): { data_version: string; corrections: Correction[] } {
  if (!correctionsCache) {
    correctionsCache = correctionsFileSchema.parse(
      readJson(path.join("v2", "corrections.json")),
    );
  }
  return correctionsCache;
}

let pendingYearsCache: PendingYear[] | null = null;

/** Adopted fiscal years intentionally waiting on a publishable final county source. */
export function getPendingYears(): PendingYear[] {
  if (!pendingYearsCache) {
    pendingYearsCache = pendingYearsFileSchema.parse(
      readJson(path.join("v2", "pending-years.json")),
    );
  }
  return pendingYearsCache;
}

let verificationCache: VerificationYear[] | null = null;

/** How deeply each fiscal year was verified against the printed page. */
export function getVerification(): VerificationYear[] {
  if (!verificationCache) {
    verificationCache = verificationFileSchema.parse(
      readJson(path.join("v2", "verification.json")),
    );
  }
  return verificationCache;
}

/** Every note in the caveat layer, for the methodology page's glossary of them. */
export function getAllDataNotes(): DataNote[] {
  return allDataNotes();
}

let dataNotes: DataNote[] | null = null;

function allDataNotes(): DataNote[] {
  if (dataNotes === null) {
    dataNotes = dataNotesFileSchema.parse(readJson(path.join("v2", "notes.json"))).notes;
  }
  return dataNotes;
}

/**
 * Notes that apply to a fiscal year, optionally narrowed to one scope.
 *
 * A note with no year range applies to every year. Scope narrowing matters because a
 * dataset-wide note (which budget the comparison uses) and a line-level one (this figure is
 * derived) belong in different places on the page.
 */
export function getDataNotes(
  fiscalYear: number,
  options: { scopeType?: DataNote["scope_type"]; scopeValue?: string; statusClass?: DataNote["status_class"] } = {},
): DataNote[] {
  return allDataNotes().filter((note) => {
    const start = note.fiscal_year_start;
    const end = note.fiscal_year_end;
    if (start !== null && fiscalYear < start) return false;
    if (end !== null && fiscalYear > end) return false;
    if (options.statusClass !== undefined && note.status_class !== null
      && note.status_class !== options.statusClass) return false;
    if (options.scopeType && note.scope_type !== options.scopeType) return false;
    if (options.scopeValue && note.scope_value && note.scope_value !== options.scopeValue) {
      return false;
    }
    return true;
  });
}

/** Notes whose declared scope reaches the General Fund cycle page. */
export function getGeneralFundPageNotes(fiscalYear: number): DataNote[] {
  return assertGeneralFundPageCanRender(fiscalYear, getDataNotes(fiscalYear).filter((note) => {
    if (note.scope_type === "fiscal_year") return true;
    if (note.scope_type === "dataset") {
      return note.scope_value === "general_fund_budget_actual_comparison";
    }
    if (note.scope_type === "line") return true;
    if (note.scope_type === "entity") {
      return note.scope_value === "fund.general" || note.scope_value === "fin.gf.transfers-in";
    }
    // A department-series break is discharged on the entity's own series, not by listing
    // it at the foot of an aggregate General Fund page.
    return false;
  }));
}

/**
 * The General Fund page renders its notes as numbered footnotes and nothing else. A `callout`
 * or `explanation` note reaching it would be skipped by both `numberNotes` and
 * `NoteFootnotes` and appear nowhere, with every test green. This runs at build time, so the
 * export fails by name instead.
 */
export function assertGeneralFundPageCanRender(fiscalYear: number, notes: DataNote[]): DataNote[] {
  const unrenderable = notes.filter((note) => note.render_contract === "callout" || note.render_contract === "explanation");
  if (unrenderable.length > 0) {
    throw new Error(
      `The General Fund FY${fiscalYear} page has no renderer for `
      + unrenderable.map((note) => `${note.note_id} (${note.render_contract})`).join(", ")
      + ". Give the page one before scoping such a note to it.",
    );
  }
  return notes;
}

/**
 * Caveats attached to ONE line by entity id, for the footnote layer on its page.
 *
 * Excludes `series_split`, which is not discharged by a footnote: a break is honoured by
 * the table splitting at it, and listing it again at the foot would say the same thing
 * twice in two registers.
 */
export function getEntityNotes(entityId: string): DataNote[] {
  return allDataNotes().filter(
    (note) => note.scope_type === "entity"
      && note.scope_value === entityId
      && note.render_contract !== "series_split",
  );
}

/** Whether a note applies to a point's year and status; unscoped notes apply to any status. */
export function noteAppliesToYear(
  note: DataNote,
  fiscalYear: number,
  statusClass?: DataNote["status_class"],
): boolean {
  if (note.status_class != null && note.status_class !== statusClass) return false;
  if (note.fiscal_year_start !== null && fiscalYear < note.fiscal_year_start) return false;
  if (note.fiscal_year_end !== null && fiscalYear > note.fiscal_year_end) return false;
  return true;
}

/** True when a series crossing this year must be split rather than drawn continuously. */
export function seriesBreaksAt(fiscalYear: number, scopeValue?: string): boolean {
  return seriesBreakNotesAt(fiscalYear, scopeValue).length > 0;
}

/**
 * The notes obliging a split at this year, so the renderer can show WHY it split.
 *
 * A split with no explanation is a gap the reader invents a reason for.
 *
 * `scopeValues` carries every label this series answers to — its kind ("department") and
 * its own entity id. A note scoped to the kind splits every department at that year, which
 * is right for a county-wide reorganisation and wrong for a single line absorbing its own
 * sub-lines: Engineering took in its two bureaus in FY2016 and no other department moved,
 * so that break is scoped to `dept.engineering` alone.
 */
export function seriesBreakNotesAt(fiscalYear: number, ...scopeValues: (string | undefined)[]): DataNote[] {
  const scopes = scopeValues.filter((value): value is string => value !== undefined);
  return allDataNotes().filter(
    (note) => note.render_contract === "series_split"
      && note.fiscal_year_start !== null
      && note.fiscal_year_end !== null
      && fiscalYear >= note.fiscal_year_start
      && fiscalYear <= note.fiscal_year_end
      && (scopes.length === 0 || note.scope_value === null || scopes.includes(note.scope_value)),
  );
}

/**
 * The fund whose coverage state governs an entity, by walking up the containment
 * relationships until something with a coverage claim is reached.
 *
 * Derived rather than mapped, because a hand-written map of 180 entities to their funds
 * would be wrong the first time an entity moved — and entities in this dataset do move
 * (EMS is a department, then its own operating category, then a department again).
 */
export function getCoverageScopeFor(entityId: string): string | null {
  const scopes = new Set(getCoverage().map((row) => row.scope_entity_id));
  if (scopes.has(entityId)) return entityId;

  const parentOf = new Map<string, string>();
  for (const rel of getV2Relationships()) {
    if (rel.relationship_type === "contains" || rel.relationship_type === "detail_view") {
      if (!parentOf.has(rel.to_entity_id)) parentOf.set(rel.to_entity_id, rel.from_entity_id);
    }
  }

  const chain = [entityId];
  const seen = new Set<string>([entityId]);
  let current = parentOf.get(entityId);
  while (current && !seen.has(current)) {
    if (scopes.has(current)) return current;
    seen.add(current);
    chain.push(current);
    current = parentOf.get(current);
  }

  // Containment is not the only edge into a fund. Revenue categories and balance
  // components hang off accounting statements instead, so `rev.property-taxes` has no
  // parent chain to the General Fund at all — the same gap that would have made every
  // inflow coverage claim look unbacked in the pipeline gate. Try statement scope for the
  // entity and each ancestor the walk did reach.
  for (const candidate of chain) {
    for (const statement of getV2Statements()) {
      if (!scopes.has(statement.scope_entity_id)) continue;
      if (statement.members.some((member) => member.entity_id === candidate)) {
        return statement.scope_entity_id;
      }
    }
  }
  return null;
}

let comparisonIndex: {
  fiscal_years: number[];
  sections: GeneralFundComparisonSection[];
} | null = null;

/** Years with an audited budget-versus-actual comparison, from the exported manifest. */
/**
 * Years whose General Fund page can render the complete loop: money in, the fund's position,
 * and money out. Derived from the statements that exist rather than hardcoded, so a year the
 * dataset gains appears in the navigation instead of being silently unreachable.
 */
export function getGeneralFundFullLoopYears(): number[] {
  const required = ["gf.budget-sources", "gf.position", "gf.outflow"];
  const sets = required.map(
    (id) => new Set(getV2Statement(id).instances.map((instance) => instance.fiscal_year)),
  );
  const [first, ...rest] = sets;
  return [...first]
    .filter((year) => rest.every((set) => set.has(year)))
    .sort((a, b) => a - b);
}

export type GeneralFundYearGroup = {
  key: "full-loop" | "comparison" | "partial";
  label: string;
  /** What a reader actually gets for a year in this group. */
  description: string;
  years: number[];
};

/**
 * Every fiscal year the General Fund route serves, split by what the page can show for it.
 *
 * The year control used to offer only `getGeneralFundFullLoopYears()` — FY2018 onward — so
 * sixteen years had a page and no way to reach it except a hand-typed URL. Restoring them
 * needs more than one flat list, because the years are not equivalent: FY2011–FY2017 have
 * an audited comparison but no printed sources-to-budget statement, and FY2002–FY2010 have
 * neither. A single list would promise all twenty-five years the same thing and disappoint
 * on sixteen of them.
 *
 * Derived, never hardcoded (cold-review finding R1). The ranges in the labels below are
 * what the data currently yields; the day the dataset gains FY2027 or an earlier audited
 * comparison, the groups move on their own. `partial` is deliberately the remainder rather
 * than its own range check — anything that is neither of the first two lands there by
 * construction, so a year can never fall through into being unreachable again.
 */
export function getGeneralFundYearGroups(): GeneralFundYearGroup[] {
  const all = getV2CoveredFiscalYears(getV2EntityPage("fund.general"));
  const fullLoop = new Set(getGeneralFundFullLoopYears());
  const comparison = new Set(getGeneralFundComparisonYears());

  const groups: GeneralFundYearGroup[] = [
    {
      key: "full-loop",
      label: "Complete budget loop",
      description: "Money in, fund position and money out, as one published statement.",
      years: all.filter((year) => fullLoop.has(year)),
    },
    {
      key: "comparison",
      label: "Budget and audited comparison",
      description:
        "What was budgeted and what the audit later showed, without the printed "
        + "sources-to-budget statement.",
      years: all.filter((year) => !fullLoop.has(year) && comparison.has(year)),
    },
    {
      key: "partial",
      label: "Partial historical record",
      description: "Department and category detail only; no audited comparison extracted.",
      years: all.filter((year) => !fullLoop.has(year) && !comparison.has(year)),
    },
  ];

  return groups.filter((group) => group.years.length > 0);
}

export function getGeneralFundComparisonYears(): number[] {
  if (comparisonIndex === null) {
    comparisonIndex = generalFundComparisonIndexSchema.parse(
      readJson(path.join("v2", "comparisons", "index.json")),
    );
  }
  return comparisonIndex.fiscal_years;
}

/** The actual row groups exported in every annual comparison file. */
export function getGeneralFundComparisonSections(): GeneralFundComparisonSection[] {
  // Load through the years accessor so one parsed manifest supplies both values.
  getGeneralFundComparisonYears();
  return comparisonIndex!.sections;
}

export function getGeneralFundBudgetActualComparison(
  fiscalYear: number,
): GeneralFundBudgetActualComparison | null {
  // A comparison needs an audited actual. FY2026 is adopted-budget-only until its ACFR is
  // published, so it is absent from the manifest rather than rendered with an empty actual.
  if (!getGeneralFundComparisonYears().includes(fiscalYear)) return null;
  return generalFundBudgetActualComparisonSchema.parse(
    readJson(path.join("v2", "comparisons", `general-fund-fy${fiscalYear}-budget-actual.json`)),
  );
}
