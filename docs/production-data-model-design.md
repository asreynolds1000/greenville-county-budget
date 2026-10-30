---
type: document
date: 2026-07-17
status: active
supersedes: none
---

# Production data model and import pipeline design

> **About this document.** This is the July 2026 design record. Its accounting rules govern the
> site today. Its implementation steps are history: the plans and reviews it mentions were
> internal working documents and are not published here.


## Implementation status

Implemented and stabilized on 2026-07-17. The production pipeline now includes
category-scoped mappings, foreign-key enforcement on curated and canonical
relationships, a non-additive `detail_view` link from the General Fund to its
appropriations hierarchy, and separately provenance-tagged FY2022–FY2023 recovered
detail. Current counts and publication-gate status live in
[`curation-notes.md`](curation-notes.md). The remainder
of this document records the design that guided implementation.

This spec defines the versioned, long-form production data model and the import
pipeline that turns the completed source-first extraction into application-ready,
fully source-cited data for the Greenville County Budget Explorer.

It is the resolution of the roadmap's stated blocker: "the unresolved dependency
is the durable, versioned data model." It does **not** design any user interface,
choose a chart library, or select a frontend framework. Those come after the data
layer is reproducible.

## Scope

In scope:

- The canonical data model (schema) for observations, interpretation, and canonical values.
- The import pipeline that ingests the blind-extraction outputs and materializes application-ready artifacts.
- The label-crosswalk method for mapping messy source labels to canonical entities across all years.
- Validation invariants and the materialized output formats.

Out of scope (deliberately deferred):

- Frontend, visualization, chart-library, and framework decisions.
- Workforce/FTE, salary, roads-as-funding, and tax-district datasets (the schema
  is built to accommodate them without change, but their extraction and curation
  are separate roadmap tracks).
- Any FY2027 data (Council adopted FY2027 on 2026-06-16, but no consolidated final adopted
  source is posted; the official package is an unsigned after-second-reading ordinance plus
  separately approved minutes).

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Pickup scope | Design the data model first, then plan review, then build | Matches the brainstorm → review-plan → implement workflow; the roadmap names the data model the unresolved dependency. |
| Storage target | Storage-neutral long-form source of truth; materialize to a portable read-only artifact | Most auditable and git-diffable; no server; matches the roadmap's engine-agnostic intent. |
| Model shape | Hybrid: immutable observations + dimension/crosswalk tables + a materialized canonical layer | Source layer stays fully auditable; consumers read a convenient canonical layer; interpretation is reversible and diffable. |
| Conflict policy | Latest official book wins within a status class; keep the beaten alternatives; flag unresolved cases `disputed` | Rule-based, documented, neutral; later restatements supersede earlier figures; disagreement is preserved, not hidden. |
| v1 curation reach | All years FY2002–FY2026, full department/category depth | Decision: completeness over a single proving slice. Requires the candidate-clustering method below to stay tractable. |

## Architecture

Three layers plus a five-stage pipeline. Data flows one direction: source
observations are immutable; interpretation is layered on in diffable dimension
tables; the canonical layer is regenerated, never hand-edited.

```
blind-extraction CSVs (source-first, as-printed)
        │  ingest_observations
        ▼
[ Layer 1 ] observation            ← append-only, one row per printed number
        │
        │  load_dimensions (source registry + curated mapping files)
        ▼
[ Layer 2 ] source, entity, label_map, hierarchy_edge, status_class
        │  build_canonical (selection policy + rollups)
        ▼
[ Layer 3 ] canonical_value, hierarchy_rollup, correction_log
        │  validate  → materialize
        ▼
portable read-only SQLite + per-year JSON bundles + data dictionary + corrections log
```

### Physical layout and source of truth

The schema below is the logical model. Physically:

- **Git-tracked source of truth**: the blind-extraction CSVs (Layer 1, already
  canonical and in the repo) plus the curated dimension files — `entity`,
  `label_map`, `hierarchy_edge`, `source`, `status_class` — kept as long-form
  CSV/YAML in the repo so every interpretation change is a reviewable diff.
- **Build intermediate**: the pipeline loads those files into an in-process
  database (SQLite/DuckDB) to compute the canonical layer. This DB is disposable
  and regenerated on every run; it is not the source of truth.
- **Generated artifacts** (`dist/`): the materialized read-only SQLite file and
  JSON bundles consumers read. Never hand-edited; reproducible from the source files.

### Layer 1 — Observation store (immutable, as-printed)

A single long-form `observation` table: the union of the six blind-extraction
primary files, normalized to one shared column set. Each row is one number as
printed in one official document. Append-only. Corrections are new rows plus a
`correction_log` entry, never edits.

`observation`

| Column | Type | Notes |
|---|---|---|
| `observation_id` | text (PK) | Deterministic hash of `source_code` + `pdf_page` + `table_section` + `original_label` + `fiscal_year` + `status` + `value`. Makes re-import idempotent. |
| `fiscal_year` | int | Ending fiscal year. |
| `value` | int | Whole dollars for `measure_type=dollars`; count/other for future measures. Source dash/`--` normalized to `0`, matching the extraction convention. |
| `measure_type` | text | Controlled: `dollars` (all current rows), later `fte`, `headcount`, `salary`, `count`. |
| `status` | text | Raw source status verbatim (`ACTUAL`, `BUDGET`, `ADOPTED BUDGET`, `PROPOSED BUDGET`, `APPROVED BUDGET`, `PROJECTED`, `PROJECTION`, `ESTIMATED`, `BUDGETED FINANCING`). |
| `status_class` | text (FK) | Normalized class; see `status_class` table. Never blended across classes. |
| `original_label` | text | Verbatim, OCR artifacts preserved. Never renamed. |
| `table_section` | text | Source table/section name. |
| `raw_fund_type` | text | Source `fund_type` where present. |
| `raw_operating_category` | text | Source `operating_category` where present. |
| `included_in_reported_total_budget` | text | `yes` / `no` / null. Carries the Internal Service Fund exclusion. |
| `source_code` | text (FK) | → `source`. |
| `document_title_version` | text | Denormalized for readability/audit. |
| `source_url` | text | Official PDF URL. |
| `pdf_page` | int | Physical PDF page (1-based). |
| `printed_page` | int | Page printed in the book, where text-extractable. |
| `ambiguity_flag` | text | Row-level caveat flag from extraction. |
| `notes` | text | Row-level notes, including visual-transcription disclosures. |
| `treatment_note` | text | e.g., ISF inclusion treatment. |
| `source_dataset` | text | Which blind-extraction file the row came from (provenance of provenance). |

`status_class` (controlled vocabulary)

| Column | Notes |
|---|---|
| `status_class` (PK) | `actual`, `adopted`, `approved`, `proposed`, `projected`, `estimated`, `financing`. |
| `raw_statuses` | The source strings that map here. |
| `display_label` | UI label. |
| `is_comparable_group` | Grouping key; values in different classes must never be summed or trended together silently. |

### Layer 2 — Dimensions and crosswalk (interpretation)

`source` (official-source registry, from `official-source-registry.csv`)

| Column | Notes |
|---|---|
| `source_code` (PK) | e.g., `FY2004-05`, `INDEX`. |
| `document_title_version` | Full title. |
| `official_url` | Landing/PDF URL. |
| `role` | e.g., `Row-level extraction source`. |
| `covers_fiscal_years` | FYs the book reports (for conflict resolution). |
| `publication_order` | Integer ordering so "later book" is expressible for the conflict policy. |

`entity` (canonical concepts)

| Column | Notes |
|---|---|
| `entity_id` (PK) | Stable slug, e.g., `dept.county-administrator`, `fund.general`, `fundtype.special-revenue`, `rev.county-offices`. |
| `entity_type` | `fund_type`, `fund`, `department`, `operating_category`, `revenue_category`, `balance_line`, `program`, `budget_line`. |
| `canonical_name` | Clean display name. |
| `common_aliases` | Search synonyms / plain-language terms (deputies → Sheriff, etc.). |
| `plain_language_description` | Neutral definition. |
| `restriction_note` | e.g., restricted special-revenue fund. |
| `active_from_fy` / `active_to_fy` | Lifespan; null-open where ongoing. |

`label_map` (the crosswalk — the diffable heart of interpretation)

| Column | Notes |
|---|---|
| `label_map_id` (PK) | Surrogate. |
| `original_label` | The verbatim source label being mapped. |
| `match_scope` | `label`, `label+section`, or `label+section+source` — how specific the match is. |
| `table_section` | Constrains the match when scope includes section. |
| `source_code` | Constrains the match when scope includes source. |
| `entity_id` (FK) | → `entity`. |
| `effective_from_fy` / `effective_to_fy` | Handles cross-year renames/reorganizations. |
| `mapping_note` | Why (OCR normalization, rename, split/merge). |
| `review_status` | `machine_candidate`, `human_confirmed`, `human_edited`. Only confirmed/edited rows are used by `build_canonical`; candidates are surfaced for review. |

`hierarchy_edge` (year-scoped tree; funding edges reuse the same table later)

| Column | Notes |
|---|---|
| `edge_id` (PK) | Surrogate. |
| `parent_entity_id` (FK) | Node above. |
| `child_entity_id` (FK) | Node below. |
| `relationship` | `contains` (spending tree) now; `funds` (many-to-many funding view) later. |
| `effective_from_fy` / `effective_to_fy` | Year-scoped; a department moving categories is two edges with adjoining ranges. |
| `edge_note` | Reorganization note. |

### Layer 3 — Canonical layer (materialized, regenerated)

`canonical_value` (one selected value per entity/year/status_class/measure)

| Column | Notes |
|---|---|
| `entity_id` + `fiscal_year` + `status_class` + `measure_type` | Composite key. |
| `value` | The selected number. |
| `chosen_observation_id` (FK) | → `observation`; the winning row. |
| `alternative_observation_ids` | The beaten alternatives (for "an earlier book reported $X"), as a serialized list or a small `canonical_alternative` child table keyed on the canonical row. |
| `canonical_status` | `single` (one source), `resolved` (policy chose among conflicts), or `disputed` (policy could not choose — UI must show all). |
| `selection_rule` | The rule applied, recorded for audit. |

`hierarchy_rollup` (computed totals per node/year, with reconciliation)

| Column | Notes |
|---|---|
| `entity_id` + `fiscal_year` + `status_class` | Composite key. |
| `rolled_up_value` | Sum of children under `contains` edges for that year. |
| `direct_value` | The node's own `canonical_value` where one exists. |
| `reconciles` | Boolean; whether rollup equals the county-reported total for that node/year. |
| `reconciliation_note` | Explanation when it does not (e.g., known interfund-transfer omission). |

`correction_log`

| Column | Notes |
|---|---|
| `correction_id` (PK) | Surrogate. |
| `superseded_observation_id` | The row being corrected (kept, not deleted). |
| `replacement_observation_id` | The new row. |
| `reason` | Human explanation. |
| `corrected_at` | Timestamp. |

## Canonical selection policy

For each (`entity_id`, `fiscal_year`, `status_class`, `measure_type`):

1. Gather all mapped observations.
2. If exactly one → `canonical_status = single`.
3. If more than one, apply **latest-book-wins**: choose the observation whose
   `source.publication_order` is highest (the most recently published official
   book). Record the beaten rows in `alternative_observation_ids`, set
   `canonical_status = resolved`, and record `selection_rule = latest_book_wins`.
4. If the rule cannot break the tie (equal publication order, or a genuine
   same-book contradiction) → `canonical_status = disputed`; store no default
   `value`; surface all alternatives.

Status classes are never merged. A `proposed` value never substitutes for an
`adopted` value; each class resolves independently. The 112 rows in
`official-document-conflicts.csv` are the primary input to steps 3–4.

## Label crosswalk method (required by all-years, full-depth)

Hand-mapping every label across 25 years of OCR-drifted books is the dominant
manual cost. The pipeline makes it tractable without ceding authority to the machine:

1. **Normalize** each `original_label` deterministically (collapse OCR spacing
   like "A DMINISTRA TOR", fix known character swaps, casefold) into a
   `normalized_label`. The raw label is never mutated in `observation`; normalization
   is a derived column used only for grouping.
2. **Cluster** normalized labels within an `entity_type` + `table_section` scope,
   producing candidate `entity` records and candidate `label_map` rows with
   `review_status = machine_candidate`.
3. **Human review**: the candidates are written to a reviewable mapping file
   (CSV/YAML in the repo). The human confirms, edits, splits, or merges clusters,
   flipping rows to `human_confirmed` / `human_edited`. Reorganizations and renames
   are expressed via `effective_from_fy`/`effective_to_fy`.
4. `build_canonical` uses only confirmed/edited rows. Any observation whose label
   has no confirmed mapping is reported by `validate` (never silently dropped).

This preserves the audit trail (every mapping is human-approved and diffable)
while removing the tedium of grouping thousands of near-duplicate labels.

## Import pipeline

Reuses the existing `scripts/` and `tests/` conventions Codex established. Five stages:

1. **`ingest_observations`** — read the six blind-extraction primary CSVs, normalize
   to the `observation` schema, derive `status_class`, compute deterministic
   `observation_id`, and record `source_dataset`. Idempotent.
2. **`load_dimensions`** — load `source` from the source registry; load `status_class`
   vocab; load `entity`, `label_map`, `hierarchy_edge` from the curated, human-reviewed
   mapping files. Emits candidate mappings for any unmapped labels.
3. **`build_canonical`** — apply the selection policy → `canonical_value`; compute
   `hierarchy_rollup` from `contains` edges.
4. **`validate`** — assert the invariants below; fail loudly.
5. **`materialize`** — emit the portable artifacts.

## Validation invariants (the teeth)

`validate` fails the build if any of these break:

- Every `observation` has a `source_code`, `source_url`, and `pdf_page`.
- Every `canonical_value.chosen_observation_id` references a real observation.
- The four included fund types reconcile exactly to the county-reported `TOTAL BUDGET`
  for every FY2002–FY2026 (a property already true in the source; a mapping error
  that breaks it is caught here).
- Named Special Revenue components reconcile to the reported Special Revenue total per year.
- Broad General Fund revenue components reconcile to `Total Estimated Financial Sources` per year.
- No `hierarchy_rollup` sums across differing `status_class` values.
- Internal Service Fund rows are excluded from any total that claims to equal `TOTAL BUDGET`.
- Every observation label resolves to a confirmed `entity`, OR appears in the
  unmapped-labels report. Zero silent drops.
- FY2022–FY2023 General Fund department detail is present as an explicit gap marker,
  not fabricated (see known gaps).

## Materialized outputs

`materialize` produces, all generated and never hand-edited:

- `dist/gc_budget.sqlite` — the primary portable, read-only query artifact (DuckDB export optional if a later frontend wants it).
- `dist/bundles/whole-budget-<fy>.json` — per-year whole-budget tree ready for a frontend.
- `dist/data-dictionary.md` — every table, column, controlled vocabulary, and the selection policy.
- `dist/corrections-log.md` — human-readable rendering of `correction_log`.

## Known gaps handled explicitly

- **FY2022–FY2023 department detail** — an embedded raster image in the source; kept
  as a visible gap, never extrapolated. The v1 curation reaches full depth for every
  year that *has* text-extractable detail; this year's department layer stays marked unavailable.
- **FY2027** — legally adopted but no consolidated final primary source is posted; excluded.
  Proposed values and totals reconstructed across the unsigned ordinance and amendment
  minutes are not promoted into production.
- **Internal Service Fund** — preserved but excluded from `TOTAL BUDGET` arithmetic,
  matching the source's own treatment.
- **Cross-book conflicts** — resolved by policy with alternatives retained, or flagged `disputed`.

## Testing approach

- Unit tests per pipeline stage (ingest idempotency, status-class mapping, id determinism,
  selection-policy branches including the disputed case, rollup arithmetic).
- Reconciliation tests asserting the invariants above against the real FY2002–FY2026 data.
- A fixture set of conflict rows exercising latest-book-wins and the disputed fallback.
- Extends the existing `tests/` harness; every stage ships with tests before it is called done.

## Non-goals (YAGNI)

- No UI, chart library, or framework selection.
- No live database server; no Supabase.
- No repair-in-place of the legacy `budget-data/` CSV/SQLite (superseded by the source-first extraction).
- No FY2027, no fabricated FY2022–FY2023 department detail.
- No workforce/roads/tax-district extraction in this spec (schema-ready, separately curated later).

## Open follow-ups (not blockers for this build)

- The exact normalized-label rules will grow as clustering surfaces real OCR patterns; captured in the mapping files, not hardcoded assumptions.
- Population and inflation reference series (for per-resident/real-dollar views) are additional `measure_type` observations added later under the same model.

## Resume / next step

After this spec is approved and passes plan review, the implementation plan
(writing-plans) sequences: schema definition → `ingest_observations` + tests →
`load_dimensions` + candidate clustering + tests → `build_canonical` + selection
policy + tests → `validate` invariants → `materialize`, then a curation pass over
the generated candidate mappings to reach full-depth coverage.
