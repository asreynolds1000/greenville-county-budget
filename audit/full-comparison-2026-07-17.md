# Full source comparison — 2026-07-17

## Decision

Do not publish the provisional working dataset as-is.

The source-first extraction in [`blind-extraction/`](blind-extraction/) is the canonical input for the historical spending hierarchy. It preserves original labels, source status, URL, document version, and physical PDF page. The old CSVs remain useful as a prototype, but their values and schemas must not flow directly into the public application.

## Scope and method

- Checked all 507 provisional records and all 731 non-key numeric cells.
- Compared budget overview, General Fund category, and Special Revenue values to an independent extraction that did not inspect the provisional dataset.
- Compared revenue, balance, and projection fields to separately transcribed official General Fund projection tables from the FY2022–23, FY2024–25, and FY2026 books.
- Preferred the latest official comparison column explicitly labeled adopted or actual for a historical fiscal year. Older official versions remain preserved as alternatives, not silently discarded.
- Preserved the status distinction among actual, budget, projected, proposed, and adopted values.

The reproducible result is [`comparison/cell-comparison.csv`](comparison/cell-comparison.csv), with aggregate counts in [`comparison/comparison-summary.json`](comparison/comparison-summary.json).

## Results

| Classification | Numeric cells | Meaning |
|---|---:|---|
| Verified against selected canonical source | 663 | Stored value matches the selected official observation. |
| Matches an older official version only | 20 | Dollar value is printed by the county, but a later adopted comparison column differs. |
| Matches older version but status is wrong | 7 | Value exists, but the provisional `actual` label conflicts with `budget` or `projected` in that source. |
| Direct source mismatch | 33 | Stored value does not match the selected official value or any mapped official version. |
| Misleading category label | 2 | Value is right, but the source category is different. |
| Unstable/ambiguous field meaning | 6 | The provisional column changes meaning between operating gap and after-financing excess/deficit. |
| **Total** | **731** | Every non-key numeric cell in the six provisional CSVs. |

## Material findings

### Core spending hierarchy

- FY2002 General Fund operating spending is five dollars low in the provisional file: `$92,154,032` versus `$92,154,037` in the source.
- FY2003 Public Works is `$1,199,786` high: `$13,397,777` versus `$12,197,991`.
- Three FY2024 categories contain later-year values, overstating the FY2024 component sum by `$8,635,261`:
  - Department of Administration: `$44,035,256` stored versus `$39,132,287` official.
  - Department of General Services: `$8,349,329` stored versus `$7,514,258` official.
  - Department of Public Works: `$26,595,450` stored versus `$23,698,229` official.
- FY2012 and FY2013 values labeled `Public Works` are actually the source's combined `Community Development and Planning` category. The dollars match, but the label would mislead users comparing departments over time.
- Twenty overview cells match an older official book but not the selected later adopted comparison column. These are version differences, not invented numbers; the product must expose its version-selection rule.

### Special Revenue funds

- Six stored values have no matching mapped official observation, including Infrastructure Bank FY2003, Hospitality Tax FY2006/FY2007/FY2021, Victims Rights FY2010, and Affordable Housing FY2025.
- Four FY2012–FY2013 Road Program/Infrastructure Bank values match an older county book but differ materially from later adopted comparison columns.
- Roads cannot be explained from the Road Program line alone. The product data model must support a service or purpose receiving money from multiple funds and revenue streams.

### General Fund revenue and cash

- The FY2022 revenue rows mix a budget column from the FY2022–23 book with an actual column from the FY2024–25 book, while labeling both `actual`. Property Taxes appears twice for FY2022.
- Nine revenue values conflict with the selected official projection tables. Several are small transcription errors; others are copied from the wrong year or field.
- FY2020 beginning fund balance is `$600` high in the provisional file: `$51,006,997` versus `$51,006,397`.
- FY2022–FY2023 fund-balance values are budget/projected observations labeled as actual, followed by later revised actual values in FY2024. That creates a false discontinuity unless source versions and statuses are shown.
- A fund balance is not the same as unrestricted cash available to spend. The application should use the official label and explain restrictions/reserves rather than presenting one figure as “cash on hand.”

### Projection schema

The provisional `general_fund_projection.csv` is structurally unsafe:

- FY2023 combines revenue and expenditure totals from one year/version with transfers and balance values from another.
- Several `ending_balance` values are actually beginning balances.
- `excess_deficiency` alternates between two concepts: revenue minus recurring expenditures, and the source table's after-financing `EXCESS (DEFICIT)`.
- `net_change` has no stable source mapping and contains year-shifted or unsupported values in most years.

Do not repair this table in place. Replace it with a long-form observation model that retains `metric`, `fiscal_year`, `status`, `source_version`, and `value` as separate fields.

## Independent extraction corrections

The blind extraction itself was not accepted without review. Deterministic checks
and the later production-rollup review found and corrected parser issues:

1. A source-printed blank dash separated from a later positive cell could be consumed as a minus sign.
2. OCR spacing variants such as `SERV ICE` prevented some same-label official conflicts from grouping together.
3. Hyphens inside labels such as `ENGINEERING - NORTHERN BUREAU` could be mistaken
   for source-printed zero cells.
4. Sparse rows with a missing early-year value could shift a later year or change
   column into the wrong fiscal year.

After correction:

- Included major-fund totals reconcile to the county-reported `TOTAL BUDGET` in all 25 covered fiscal years.
- Named Special Revenue components reconcile to their reported total in all 25 years.
- Broad General Fund revenue components reconcile to their reported total in all 25 years.
- Every primary observation carries an official URL and physical PDF page.
- The production layer has no canonical disputes, and every adopted rollup with a
  printed comparison total reconciles.

## Coverage limits

- FY2002–FY2003 are available only as comparison columns in the earliest online FY2004–FY2005 book; no standalone adopted books were located in the current county archive.
- The FY2022–FY2023 department-level appropriations table is an embedded image.
  It was subsequently recovered through two independent transcriptions, checked
  against every printed subtotal and grand total, and stored separately under
  `data/recovered/` so its provenance remains distinct from text extraction.
- As of 2026-07-17, the county's official budget index lists FY2026 as its latest final budget book. No final adopted FY2027 book was located, so FY2027 must not be presented as adopted from the currently available primary sources.

## Publication gate

The historical overview hierarchy can be built from the canonical source-first tables now. Before public launch:

1. Build the FY2026 application vertical slice from the completed long-form
   production artifacts rather than the old wide CSVs.
2. Keep FY2027 clearly absent or proposed until a final adopted primary source is available.
3. Add workforce/FTE, salary, tax-district, millage, debt, and road-funding sources as separately audited datasets.
4. Require every chart and calculator result to link back to its source page and status.
