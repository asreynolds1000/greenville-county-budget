/**
 * Zod schemas for every file the Python exporter (scripts/production/export_app.py)
 * writes into web/data/. This is the single source of type truth for the app —
 * every TypeScript type below is inferred from a schema, never hand-declared.
 *
 * Schemas are deliberately as strict as the data we've actually observed
 * New enum values or a
 * new shape landing in web/data/ should fail validate-data.ts, not pass silently —
 * that's the point of the prebuild gate.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Fiscal years covered by the data: FY2002 (earliest source) - FY2026 (latest adopted). */
const fiscalYearSchema = z.number().int().min(2002).max(2026);

/** A dollar amount as printed/computed. Always a whole-dollar integer, never a float (plan R1). */
const dollarAmountSchema = z.number().int();

/** A dollar amount that may be genuinely unknown/unpublished. null !== 0 (plan Decision 4 / R2). */
const nullableDollarAmountSchema = dollarAmountSchema.nullable();

/** The controlled source token retained when its arithmetic value is zero. */
export const printedFormSchema = z.enum(["0", "-", "--", "(0)", "missing"]);
export type PrintedForm = z.infer<typeof printedFormSchema>;

export const entityTypeSchema = z.enum([
  "whole_budget",
  "fund_type",
  "fund",
  "general_fund_total",
  "operating_category",
  "department",
  "program",
  "revenue_total",
  "revenue_category",
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

export const statusClassSchema = z.enum(["adopted", "estimated"]);
export type StatusClass = z.infer<typeof statusClassSchema>;

/**
 * The full status_class vocabulary that exists anywhere in the dataset.
 * pages/*.json series entries are adopted-or-estimated only (see
 * statusClassSchema) because the app is an adopted-status product (plan T2)
 * — but years.json's gf_expenditures_vs_budget surfaces "actual"/"projected"
 * for FY2002-03, where department detail was never published as adopted
 * (napkin: "Adopted department series starts FY2004").
 */
export const anyStatusClassSchema = z.enum(["adopted", "estimated", "actual", "projected"]);
export type AnyStatusClass = z.infer<typeof anyStatusClassSchema>;

export const canonicalStatusSchema = z.enum(["single", "resolved"]);
export type CanonicalStatus = z.infer<typeof canonicalStatusSchema>;

export const edgeRelationshipSchema = z.enum(["contains", "detail_view"]);
export type EdgeRelationship = z.infer<typeof edgeRelationshipSchema>;

// ---------------------------------------------------------------------------
// entities.json — the entity dimension. Drives search, labels, generateStaticParams.
// ---------------------------------------------------------------------------

export const entitySummarySchema = z.object({
  active_from_fy: fiscalYearSchema.nullable(),
  active_to_fy: fiscalYearSchema.nullable(),
  canonical_name: z.string().min(1),
  /**
   * Curated resident-facing label, when one exists.
   *
   * Never replaces `canonical_name`, which stays source-faithful for provenance,
   * citations and downloads. Read it through `displayName()` rather than directly, so
   * the fallback lives in one place.
   */
  display_name: z.string().min(1).nullish(),
  common_aliases: z.array(z.string()),
  entity_id: z.string().min(1),
  entity_type: entityTypeSchema,
  plain_language_description: z.string().min(1),
  restriction_note: z.string().nullable(),
});
export type EntitySummary = z.infer<typeof entitySummarySchema>;

export const entitiesFileSchema = z.array(entitySummarySchema);

// ---------------------------------------------------------------------------
// sources.json — the source registry (book titles, URLs, publication order).
// ---------------------------------------------------------------------------

export const sourceSchema = z.object({
  document_title_version: z.string().min(1),
  official_url: z.url(),
  /**
   * A third-party snapshot of this document, where one exists.
   *
   * The county's own URL stays primary — it is the authoritative location. This is what a
   * citation degrades to when that link dies, which for county websites is a matter of
   * when. Optional because three documents have no snapshot yet, and promising an archived
   * copy that does not exist would be worse than offering none.
   */
  archive_url: z.url().optional(),
  /** YYYYMMDD, as the Wayback Machine records it. */
  archived_on: z.string().optional(),
  publication_order: z.number().int(),
  role: z.string().min(1),
  source_code: z.string().min(1),
});
export type Source = z.infer<typeof sourceSchema>;

export const sourcesFileSchema = z.array(sourceSchema);

// ---------------------------------------------------------------------------
// years.json — per-year coverage/status summary for the scrubber.
// ---------------------------------------------------------------------------

const coverageEntrySchema = z.object({
  dataset: z.string().min(1),
  gap_note: z.string().nullable(),
  has_detail: z.boolean(),
});

const gfExpendituresVsBudgetSchema = z.object({
  fund_general_value: nullableDollarAmountSchema,
  gf_expenditures_status_class: anyStatusClassSchema.nullable(),
  gf_expenditures_value: nullableDollarAmountSchema,
  note: z.string().nullable(),
  status: z.enum(["matches", "value_divergence", "coverage_gap", "not_applicable"]),
});

const yearCoverageSchema = z.object({
  budget_total_status_class: statusClassSchema.nullable(),
  coverage: z.array(coverageEntrySchema),
  fiscal_year: z.number().int(),
  gf_expenditures_vs_budget: gfExpendituresVsBudgetSchema,
  recovered_provenance: z.boolean(),
});
export type YearCoverage = z.infer<typeof yearCoverageSchema>;

/** Keyed by fiscal year as a string, e.g. "2002".."2027". */
export const yearsFileSchema = z.record(z.string(), yearCoverageSchema);

// ---------------------------------------------------------------------------
// pages/<entity_id>.json — one file per visible entity.
// ---------------------------------------------------------------------------

export const citationSchema = z.object({
  original_label: z.string().min(1),
  pdf_page: z.number().int(),
  printed_page: z.number().int().nullable(),
  source_code: z.string().min(1),
  source_url: z.url(),
  /** Raw printed status text from the source document (edition-header drift; see napkin). */
  status: z.string().min(1),
});

export type Citation = z.infer<typeof citationSchema>;

const alternativeSchema = z.object({
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  source_code: z.string().min(1),
  value: dollarAmountSchema,
});

const reconciliationSchema = z.object({
  direct_value: dollarAmountSchema,
  reconciles: z.boolean(),
  reconciliation_note: z.string().nullable(),
  rolled_up_value: dollarAmountSchema,
});

/**
 * One year's canonical observation for an entity. NOTE: `value` here is never
 * null — a fiscal year with no canonical value of this entity's status class
 * simply has no entry in `series` for that year. Callers must build the full
 * FY2002-2026 range themselves and treat missing years as unpublished (null).
 * See loaders.ts `seriesByYear`.
 */
const seriesPointSchema = z.object({
  alternatives: z.array(alternativeSchema),
  canonical_status: canonicalStatusSchema,
  citation: citationSchema,
  fiscal_year: fiscalYearSchema,
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  reconciliation: reconciliationSchema.nullable(),
  status_class: statusClassSchema,
  value: dollarAmountSchema,
});
export type SeriesPoint = z.infer<typeof seriesPointSchema>;

const childRefSchema = z.object({
  canonical_name: z.string().min(1),
  entity_id: z.string().min(1),
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  value: nullableDollarAmountSchema,
});
export type ChildRef = z.infer<typeof childRefSchema>;

const parentRefSchema = z.object({
  canonical_name: z.string().min(1),
  edge_note: z.string().min(1),
  entity_id: z.string().min(1),
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  relationship: edgeRelationshipSchema,
  /** The PARENT's own value that year — may be null even when the child's own value is known. */
  value: nullableDollarAmountSchema,
});
export type ParentRef = z.infer<typeof parentRefSchema>;

const gapBreakSchema = z.object({
  kind: z.literal("gap"),
  from_fy: fiscalYearSchema,
  to_fy: fiscalYearSchema,
  note: z.string().min(1),
});

const parentChangeBreakSchema = z.object({
  kind: z.literal("parent_change"),
  at_fy: fiscalYearSchema,
  from_parents: z.array(z.string()),
  to_parents: z.array(z.string()),
  note: z.string().min(1),
});

/** A discriminated union so a break is always exactly one honest shape, never a grab-bag. */
const breakSchema = z.discriminatedUnion("kind", [gapBreakSchema, parentChangeBreakSchema]);
export type EntityBreak = z.infer<typeof breakSchema>;

const detailViewDivergenceSchema = z.object({
  fiscal_year: fiscalYearSchema,
  fund_general_value: dollarAmountSchema,
  gf_expenditures_value: dollarAmountSchema,
});

/** Present only on fund.general — the non-additive GF department-detail edge (napkin gotcha). */
const detailViewSchema = z.object({
  coverage_gap_fiscal_years: z.array(fiscalYearSchema),
  entity_id: z.string().min(1),
  note: z.string().min(1),
  relationship: edgeRelationshipSchema,
  value_divergence_fiscal_years: z.array(detailViewDivergenceSchema),
});
export type DetailView = z.infer<typeof detailViewSchema>;

/** Present only on fund.general — the labeled `estimated` money-in panel (T2). */
const revenuePanelSchema = z.object({
  entity_id: z.string().min(1),
  note: z.string().min(1),
  status_class: statusClassSchema,
});
export type RevenuePanel = z.infer<typeof revenuePanelSchema>;

export const entityPageSchema = z.object({
  active_from_fy: fiscalYearSchema.nullable(),
  active_to_fy: fiscalYearSchema.nullable(),
  breaks: z.array(breakSchema),
  canonical_name: z.string().min(1),
  /**
   * Curated resident-facing label, when one exists.
   *
   * Never replaces `canonical_name`, which stays source-faithful for provenance,
   * citations and downloads. Read it through `displayName()` rather than directly, so
   * the fallback lives in one place.
   */
  display_name: z.string().min(1).nullish(),
  /** Keyed by fiscal year as a string. A dual-parent overlap year has length-2 arrays (napkin). */
  children_by_year: z.record(z.string(), z.array(childRefSchema)),
  common_aliases: z.array(z.string()),
  entity_id: z.string().min(1),
  entity_type: entityTypeSchema,
  parent_by_year: z.record(z.string(), z.array(parentRefSchema)),
  plain_language_description: z.string().min(1),
  primary_status_class: statusClassSchema,
  restriction_note: z.string().nullable(),
  series: z.array(seriesPointSchema),
  whole_budget_total_by_year: z.record(z.string(), dollarAmountSchema),
  /** fund.general only. */
  detail_view: detailViewSchema.optional(),
  /** fund.general only. */
  revenue_panel: revenuePanelSchema.optional(),
  /** fund.internal-service only. */
  excluded_from_total: z.boolean().optional(),
});
export type EntityPage = z.infer<typeof entityPageSchema>;

// ---------------------------------------------------------------------------
// V2 sources / funds / uses contract. Additive to the frozen v1 schemas above.
// ---------------------------------------------------------------------------

export const v2StatusClassSchema = z.enum([
  "actual",
  "adopted",
  "estimated",
  "financing",
  "projected",
  "proposed",
]);

export const v2EntityTypeSchema = z.enum([
  "balance_adjustment",
  "balance_beginning",
  "balance_change",
  /** A classification slice of an ending balance: nonspendable, committed, unassigned. */
  "balance_component",
  "balance_ending",
  "department",
  "expense_line",
  "financing_net",
  "financing_source",
  "financing_use",
  "fund",
  "fund_type",
  "funding_total",
  "general_fund_total",
  "operating_category",
  "operating_overview_category",
  "program",
  "revenue_category",
  "revenue_source",
  "revenue_total",
  "use_total",
  "whole_budget",
]);

const accountingSchema = z.object({
  accounting_role: z.enum([
    "beginning_position",
    "container",
    "ending_position",
    "financing_in",
    "financing_out",
    "informational_total",
    "net_financing",
    "net_position_change",
    "operating_use",
    "position_adjustment",
    /** Part of a position rather than a flow into or out of it. */
    "position_component",
    "revenue",
    "scope_total",
  ]),
  included_in_scope_total: z.enum(["yes", "no", "context_only"]),
  normal_sign: z.enum(["positive", "negative", "source_signed"]),
  value_semantics: z.enum(["flow", "stock", "derived_change"]),
});

/**
 * A line continuing under a different name, in an adjacent year.
 *
 * Navigation, not arithmetic. The two series are never concatenated: whether the figures
 * either side are comparable is a separate claim, carried by a data note where the answer
 * is no. The pipeline refuses a succession whose ranges overlap or leave a gap.
 */
export const successionLinkSchema = z.object({
  entity_id: z.string().min(1),
  note: z.string().min(1),
  from_fiscal_year: fiscalYearSchema.nullable(),
  to_fiscal_year: fiscalYearSchema.nullable(),
});
export type SuccessionLink = z.infer<typeof successionLinkSchema>;

export const v2EntitySummarySchema = z.object({
  accounting: accountingSchema,
  active_from_fy: fiscalYearSchema.nullable(),
  active_to_fy: fiscalYearSchema.nullable(),
  canonical_name: z.string().min(1),
  /**
   * Curated resident-facing label, when one exists.
   *
   * Never replaces `canonical_name`, which stays source-faithful for provenance,
   * citations and downloads. Read it through `displayName()` rather than directly, so
   * the fallback lives in one place.
   */
  display_name: z.string().min(1).nullish(),
  common_aliases: z.array(z.string()),
  entity_id: z.string().min(1),
  entity_type: v2EntityTypeSchema,
  plain_language_description: z.string().min(1),
  restriction_note: z.string().nullable(),
});
export type V2EntitySummary = z.infer<typeof v2EntitySummarySchema>;
export const v2EntitiesFileSchema = z.array(v2EntitySummarySchema);

const v2AlternativeSchema = z.object({
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  source_code: z.string().min(1),
  value: dollarAmountSchema,
});

const v2SeriesPointSchema = z.object({
  alternatives: z.array(v2AlternativeSchema),
  canonical_status: canonicalStatusSchema,
  citation: citationSchema.nullable(),
  fiscal_year: fiscalYearSchema,
  measure_type: z.string().min(1),
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  selection_rule: z.string().nullable(),
  status_class: v2StatusClassSchema,
  value: nullableDollarAmountSchema,
});
export type V2SeriesPoint = z.infer<typeof v2SeriesPointSchema>;

const v2StatementMembershipSchema = z.object({
  arithmetic_sign: z.union([z.literal(-1), z.literal(1)]),
  display_order: z.number().int(),
  effective_from_fy: fiscalYearSchema.nullable(),
  effective_to_fy: fiscalYearSchema.nullable(),
  is_required: z.boolean(),
  member_role: z.string().min(1),
  statement_id: z.string().min(1),
  status_class: v2StatusClassSchema.nullable(),
  subtotal_group: z.string().nullable(),
});

export const v2EntityPageSchema = v2EntitySummarySchema.extend({
  series: z.array(v2SeriesPointSchema),
  statement_memberships: z.array(v2StatementMembershipSchema),
  /** The line this one continues as, from the following fiscal year. */
  succeeded_by: successionLinkSchema.nullish(),
  /** The line this one continues from. */
  preceded_by: successionLinkSchema.nullish(),
});
export type V2EntityPage = z.infer<typeof v2EntityPageSchema>;

export const v2RelationshipSchema = z.object({
  effective_from_fy: fiscalYearSchema.nullable(),
  effective_to_fy: fiscalYearSchema.nullable(),
  from_entity_id: z.string().min(1),
  is_additive: z.boolean(),
  relationship_id: z.string().min(1),
  relationship_note: z.string().nullable(),
  relationship_type: z.enum([
    "contains",
    "detail_view",
    "inflow_to",
    "position_of",
    "outflow_from",
    "transfer_to",
    "supports",
    "related_to",
    /** The same work continuing under a later name. Navigation, never arithmetic. */
    "succeeded_by",
  ]),
  restriction_note: z.string().nullable(),
  source_code: z.string().nullable(),
  to_entity_id: z.string().min(1),
  traceability_level: z.enum([
    "exact",
    "documented_association",
    "structural",
    "editorial_related",
  ]),
});
export type V2Relationship = z.infer<typeof v2RelationshipSchema>;
export const v2RelationshipsFileSchema = z.array(v2RelationshipSchema);

const v2StatementMemberSchema = v2StatementMembershipSchema.extend({
  entity_id: z.string().min(1),
});

const v2ResolvedStatementMemberSchema = v2StatementMemberSchema.extend({
  citation: citationSchema.nullable(),
  printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  resolved_status_class: v2StatusClassSchema.nullable(),
  signed_value: nullableDollarAmountSchema,
  value: nullableDollarAmountSchema,
});

const v2StatementInstanceSchema = z.object({
  fiscal_year: fiscalYearSchema,
  members: z.array(v2ResolvedStatementMemberSchema),
  signed_delta: dollarAmountSchema,
  source_code: z.string().min(1),
  validation_note: z.string().nullable(),
  validation_status: z.enum(["pending", "reconciled", "not_applicable", "source_exception"]),
});

export const v2StatementSchema = z.object({
  canonical_name: z.string().min(1),
  effective_from_fy: fiscalYearSchema.nullable(),
  effective_to_fy: fiscalYearSchema.nullable(),
  instances: z.array(v2StatementInstanceSchema),
  members: z.array(v2StatementMemberSchema),
  scope_entity_id: z.string().min(1),
  statement_id: z.string().min(1),
  statement_note: z.string().nullable(),
  statement_type: z.enum([
    "sources_and_uses",
    "position_reconciliation",
    "outflow_reconciliation",
    "financing_reconciliation",
    "inflow_reconciliation",
  ]),
});
export type V2Statement = z.infer<typeof v2StatementSchema>;
export const v2StatementsFileSchema = z.array(v2StatementSchema);

export const budgetActualDriverSchema = z.object({
  actual: dollarAmountSchema,
  budget: dollarAmountSchema,
  /** Positive helps the actual result; negative hurts it. */
  contribution: dollarAmountSchema,
  /** Stable display name, consistent across years. */
  label: z.string().min(1),
  /**
   * The county's printed wording for this line in this year, verbatim. It drifts between
   * years and sometimes within a single page, so it is kept apart from `label` and shown
   * where a reader is being pointed at the source page.
   */
  source_label: z.string().min(1),
  /** Join key carrying a line across the ~FY2013 department reorganisation. */
  canonical_key: z.string().min(1),
  pdf_page: z.number().int().positive(),
  printed_page: z.number().int().positive(),
});

/** A statement-wide final amended budget and audited actual, with its source page. */
export const budgetActualTotalSchema = z.object({
  budget: dollarAmountSchema,
  budget_printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  actual: dollarAmountSchema,
  actual_printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
  pdf_page: z.number().int().positive(),
  printed_page: z.number().int().positive(),
});

/**
 * A printed other-financing-sources line (a lease, an asset or land sale, a fund-balance
 * appropriation) that closes the gap between the four flow measures and the audited net
 * change. `column` distinguishes an Actual-column residual from a Final-Budget-column one,
 * because they don't always land on the same side: FY2011's is budget-only.
 */
export const budgetActualResidualComponentSchema = z.object({
  column: z.enum(["actual", "final_budget"]),
  label: z.string().min(1),
  amount: dollarAmountSchema,
  source_page: z.number().int().positive(),
  source_code: z.string().min(1),
});

export const generalFundBudgetActualComparisonSchema = z.object({
  fiscal_year: fiscalYearSchema,
  source: z.object({
    document_title_version: z.string().min(1),
    source_code: z.string().min(1),
    source_url: z.string().url(),
  }),
  totals: z.object({
    total_revenues: budgetActualTotalSchema,
    total_expenditures: budgetActualTotalSchema,
    transfers_in: budgetActualTotalSchema,
    transfers_out: budgetActualTotalSchema,
    net_change: budgetActualTotalSchema,
    residual_components: z.array(budgetActualResidualComponentSchema).optional(),
  }),
  revenue_categories: z.array(budgetActualDriverSchema),
  spending_categories: z.array(budgetActualDriverSchema),
});
export type GeneralFundBudgetActualComparison = z.infer<
  typeof generalFundBudgetActualComparisonSchema
>;

export const generalFundComparisonSectionSchema = z.enum([
  "revenue_categories",
  "spending_categories",
]);
export type GeneralFundComparisonSection = z.infer<
  typeof generalFundComparisonSectionSchema
>;
export const generalFundComparisonIndexSchema = z.object({
  fiscal_years: z.array(fiscalYearSchema),
  sections: z.array(generalFundComparisonSectionSchema).min(1),
});

export const dataNoteSchema = z.object({
  note_id: z.string().min(1),
  /**
   * `entity` narrows a note to ONE line by entity id. A `series`-scoped break splits every
   * department's history at that year, which is right for a county-wide reorganisation and
   * wrong for a single line absorbing its own sub-lines.
   */
  scope_type: z.enum(["fiscal_year", "line", "series", "dataset", "entity", "printed_form"]),
  scope_value: z.string(),
  fiscal_year_start: z.number().int().nullable(),
  fiscal_year_end: z.number().int().nullable(),
  /** Null applies to all statuses; a scoped note requires the point's matching status. */
  status_class: v2StatusClassSchema.nullable().default(null),
  note_type: z.string().min(1),
  /** Drives visual weight. Without it a dozen notes badge everything equally. */
  severity: z.enum(["info", "warning"]),
  /**
   * What the note obliges the interface to do. `series_split` and `basis_label` are
   * contracts a component must honour, not decoration: a badge over a continuous line does
   * not stop a reader treating a series across a reorganisation as one trend.
   *
   * `callout` renders in full beside the figure it qualifies and inside the chart drawn from
   * it, so a cropped screenshot still carries the caveat. `explanation` renders as an
   * expandable section under the figure. Neither is ever a numbered footnote, and the
   * footnote layer filters both out rather than relying on the numbering to hide them.
   */
  render_contract: z.enum([
    "badge", "footnote", "inline_marker", "series_split", "basis_label",
    "callout", "explanation",
  ]),
  headline: z.string().min(1),
  text: z.string().min(1),
  source_ref: z.string().min(1),
});
export type DataNote = z.infer<typeof dataNoteSchema>;
export const dataNotesFileSchema = z.object({ notes: z.array(dataNoteSchema) });

export const v2CoverageSchema = z.object({
  coverage_level: z.enum(["complete", "partial", "total_only", "unavailable"]),
  domain: z.enum(["inflow", "position", "outflow", "relationship"]),
  fiscal_year: fiscalYearSchema,
  gap_note: z.string().nullable(),
  scope_entity_id: z.string().min(1),
  source_code: z.string().nullable(),
  status_classes: z.array(v2StatusClassSchema),
});
export const v2CoverageFileSchema = z.array(v2CoverageSchema);
export type V2Coverage = z.infer<typeof v2CoverageSchema>;
export type CoverageLevel = V2Coverage["coverage_level"];
export type CoverageDomain = V2Coverage["domain"];

export const verificationYearSchema = z.object({
  anomalies_reported: z.number().int().nullable(),
  cells_dash_as_nil: z.number().int().nullable(),
  cells_exact: z.number().int().nullable(),
  cells_mismatched: z.number().int().nullable(),
  cells_sampled: z.number().int().nullable(),
  fiscal_year: fiscalYearSchema,
  method: z.enum(["blind_resample", "dual_independent_extraction"]),
  status_note: z.string().min(1),
});
export const verificationFileSchema = z.array(verificationYearSchema);
export type VerificationYear = z.infer<typeof verificationYearSchema>;

/**
 * One answerable figure for a search result.
 *
 * `observations` is an ARRAY because an entity-year can carry more than one canonical
 * status, and an estimate and an adopted figure answer different questions. Merging them,
 * or silently taking the first, would present one basis as though it were the only
 * published value (cold review finding R3). `.min(1)` because a preview with no
 * observations is a preview that should not have been emitted at all.
 */
export const searchPreviewSchema = z.object({
  fiscal_year: fiscalYearSchema,
  /** True when this is the entity's most recent published year, not the current one. */
  is_latest: z.boolean(),
  observations: z.array(z.object({
    printed_form: z.enum(["0", "-", "--", "(0)", "missing"]).nullable(),
    status_class: z.string().min(1),
    value: z.number(),
  })).min(1),
});
export type SearchPreview = z.infer<typeof searchPreviewSchema>;

export const searchEntrySchema = z.object({
  active_from_fy: fiscalYearSchema.nullable(),
  active_to_fy: fiscalYearSchema.nullable(),
  aliases: z.array(z.string()),
  description: z.string().min(1),
  domain_label: z.string().min(1),
  entity_id: z.string().min(1),
  entity_type: v2EntityTypeSchema,
  fund_id: z.string().nullable(),
  fund_label: z.string().nullable(),
  name: z.string().min(1),
  parent_label: z.string().min(1).nullable(),
  qualifier: z.string().min(1),
  /** Absent for an entity with no published dollar figure in any year. */
  preview: searchPreviewSchema.nullish(),
});
export const searchIndexFileSchema = z.array(searchEntrySchema);
export type SearchEntry = z.infer<typeof searchEntrySchema>;

export const correctionSchema = z.object({
  correction_id: z.string().min(1),
  corrected_on: z.string().min(1),
  scope_entity_id: z.string(),
  fiscal_year: z.string(),
  what_changed: z.string().min(1),
  why: z.string().min(1),
  source_ref: z.string(),
});
export const correctionsFileSchema = z.object({
  data_version: z.string().min(1),
  corrections: z.array(correctionSchema),
});
export type Correction = z.infer<typeof correctionSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export const pendingYearSchema = z.object({
  adopted_on: isoDateSchema,
  fiscal_year: z.number().int().min(2002),
  reason_not_ingested: z.string().min(1),
  status_checked_on: isoDateSchema,
});
export const pendingYearsFileSchema = z.array(pendingYearSchema).min(1);
export type PendingYear = z.infer<typeof pendingYearSchema>;

export const v2ManifestSchema = z.object({
  coverage_page_entity_count: z.number().int().positive(),
  coverage_page_route_count: z.number().int().positive(),
  coverage_record_count: z.number().int().nonnegative(),
  entity_count: z.number().int().positive(),
  fiscal_year_max: fiscalYearSchema,
  fiscal_year_min: fiscalYearSchema,
  relationship_count: z.number().int().nonnegative(),
  schema_version: z.literal(2),
  statement_count: z.number().int().nonnegative(),
  statement_instance_count: z.number().int().nonnegative(),
});
